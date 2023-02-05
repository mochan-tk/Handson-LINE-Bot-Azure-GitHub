// playground:https://bicepdemo.z22.web.core.windows.net/
param location string = resourceGroup().location
param ramdom string
param secret string
param access string

var functionAppName = 'fn-${toLower(ramdom)}'
var appServicePlanName = 'FunctionPlan'
var appInsightsName = 'AppInsights'
var storageAccountName = 'fnstor${toLower(substring(replace(ramdom, '-', ''), 0, 18))}'
var containerName = 'files'

param accountName string = 'cosmos-${toLower(ramdom)}'
var databaseName = 'SimpleDB'
var cosmosContainerName = 'Accounts'

// https://github.com/Azure-Samples/azure-data-factory-runtime-app-service/blob/ca44b7f23971c608a4e33020d130026a06f07788/deploy/modules/acr.bicep
@description('The name of the container registry to create. This must be globally unique.')
param containerRegistryName string = 'shir${uniqueString(resourceGroup().id)}'

@description('The name of the SKU to use when creating the container registry.')
param skuName string = 'Standard'

resource storageAccount 'Microsoft.Storage/storageAccounts@2021-08-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    supportsHttpsTrafficOnly: true
    encryption: {
      services: {
        file: {
          keyType: 'Account'
          enabled: true
        }
        blob: {
          keyType: 'Account'
          enabled: true
        }
      }
      keySource: 'Microsoft.Storage'
    }
    accessTier: 'Hot'
  }
}

resource container 'Microsoft.Storage/storageAccounts/blobServices/containers@2021-08-01' = {
  name: '${storageAccount.name}/default/${containerName}'
  properties: {
    publicAccess:'Container'
  }
}

// https://docs.microsoft.com/en-us/azure/cosmos-db/sql/manage-with-bicep
resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2021-10-15' = {
  name: toLower(accountName)
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    //enableFreeTier: true
    databaseAccountOfferType: 'Standard'
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    capabilities: [
      {
        name: 'EnableServerless'
      }
    ]
  }
}

resource cosmosDB 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2021-10-15' = {
  parent: cosmosAccount
  name: databaseName
  properties: {
    resource: {
      id: databaseName
    }
  }
}

resource cosmosContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2021-10-15' = {
  parent: cosmosDB
  name: cosmosContainerName
  properties: {
    resource: {
      id: cosmosContainerName
      partitionKey: {
        paths: [
          '/partitionKey'
        ]
        kind: 'Hash'
      }
     }
     options:{}
    }
  }

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

resource plan 'Microsoft.Web/serverfarms@2021-03-01' = {
  name: appServicePlanName
  location: location
  kind: 'linux'
  properties: {
    reserved: true
  }
  sku: {
    name: 'Y1'
  }
}

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2022-12-01' = {
  name: containerRegistryName
  location: location
  sku: {
    name: skuName
  }
  properties: {
    adminUserEnabled: true
  }
}

var containerImageName = 'adf/shir'
var dockerfileSourceGitRepository = 'https://github.com/mochan-tk/Handson-LINE-Bot-Azure-GitHub.git'
// https://learn.microsoft.com/en-us/azure/templates/microsoft.containerregistry/registries/taskruns
resource buildTask 'Microsoft.ContainerRegistry/registries/taskRuns@2019-06-01-preview' = {
  parent: containerRegistry
  name: 'buildTask'
  properties: {
    runRequest: {
      type: 'DockerBuildRequest'
      dockerFilePath: 'Dockerfile'
      sourceLocation: dockerfileSourceGitRepository
      imageNames: [
        '${containerImageName}'
      ]
      platform: {
        os: 'Windows'
        architecture: 'x86'
      }
    }
  }
}

resource managedEnvironments 'Microsoft.App/managedEnvironments@2022-03-01' existing = {
  name: 'managedEnv'
}

resource containerApps 'Microsoft.App/containerApps@2022-10-01' = {
  name: 'containerApps'
  location: location
  properties: {
    managedEnvironmentId: managedEnvironments.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8080
      }
    }
    template: {
      containers: [
        {
          name: 'line-bot-container-apps'
          image: '${containerRegistry.name}.azurecr.io/${containerImageName}'
          env: [
            {
              name: 'CHANNEL_SECRET'
              value: secret
            }
            {
              name: 'CHANNEL_ACCESS_TOKEN'
              value: access
            }
          ]
        }
      ]
      scale: {
        maxReplicas: 1
        minReplicas: 1
      }
    }
  }
}
/*
// https://learn.microsoft.com/en-us/azure/templates/microsoft.app/containerapps
resource functionApp 'Microsoft.Web/sites@2021-03-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp'
  properties: {
    serverFarmId: plan.id
    siteConfig: {
      appSettings: [
        {
          name: 'AzureWebJobsStorage'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${listKeys(storageAccount.id, '2019-06-01').keys[0].value}'
        }
        {
          name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${listKeys(storageAccount.id, storageAccount.apiVersion).keys[0].value}'
        }
        {
          name: 'APPINSIGHTS_INSTRUMENTATIONKEY'
          value: appInsights.properties.InstrumentationKey
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: 'InstrumentationKey=${appInsights.properties.InstrumentationKey}'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~12'
        }
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~3'
        }
        {
          name: 'CHANNEL_SECRET'
          value: secret
        }
        {
          name: 'CHANNEL_ACCESS_TOKEN'
          value: access
        }
        {
          name: 'STORAGE_CONNECTION_STRING'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${listKeys(storageAccount.id, storageAccount.apiVersion).keys[0].value}'
        }
        {
          name: 'COSMOSDB_ACCOUNT'
          value: cosmosAccount.properties.documentEndpoint
        }
        {
          name: 'COSMOSDB_KEY'
          value: cosmosAccount.listKeys().primaryMasterKey
        }
        {
          name: 'COSMOSDB_DATABASENAME'
          value: databaseName
        }
        {
          name: 'COSMOSDB_CONTAINERNAME'
          value: cosmosContainerName
        }
        {
          name: 'COSMOSDB_CONNECTION_STRING'
          value: 'AccountEndpoint=${cosmosAccount.properties.documentEndpoint};AccountKey=${cosmosAccount.listKeys().primaryMasterKey};'
        }
      ]
    }
    httpsOnly: true
  }
}

output functionAppName string = functionAppName
*/
