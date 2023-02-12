'use strict';

const line = require('@line/bot-sdk');
const express = require('express');
const crypto = require("crypto");
const { BlobServiceClient } = require("@azure/storage-blob");
const { CosmosClient } = require("@azure/cosmos");
const { CognitiveServicesCredentials } = require("@azure/ms-rest-azure-js");
const { FaceClient, FaceModels } = require("@azure/cognitiveservices-face");

// Azure Storage
const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient('files');

// Azure Cosmos DB
//https://docs.microsoft.com/en-us/azure/cosmos-db/sql/sql-api-nodejs-get-started
//https://docs.microsoft.com/en-us/azure/cosmos-db/sql/sql-api-nodejs-application
const cosmosDBConfig = {
  endpoint: process.env.COSMOSDB_ACCOUNT,
  key: process.env.COSMOSDB_KEY,
  databaseId: process.env.COSMOSDB_DATABASENAME,
  containerId: process.env.COSMOSDB_CONTAINERNAME
};

const { endpoint, key, databaseId, containerId } = cosmosDBConfig;

const cosmosDBClient = new CosmosClient({ endpoint, key });
const database = cosmosDBClient.database(databaseId);
const cosmosDBContainer = database.container(containerId);

const faceKey = process.env.COGNITIVESERVICE_KEY;
const faceEndPoint = process.env.COGNITIVESERVICE_ENDPOINT;
const cognitiveServiceCredentials = new CognitiveServicesCredentials(faceKey);
const faceClient = new FaceClient(cognitiveServiceCredentials, faceEndPoint);

// create LINE SDK config from env variables
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

// create LINE SDK client
const client = new line.Client(config);

// create Express app
// about Express itself: https://expressjs.com/
const app = express();

// serve static and downloaded files
// app.use(`/${BASE_PUBLIC_DIR}`, express.static(BASE_PUBLIC_DIR));

// register a webhook handler with middleware
// about the middleware, please refer to doc
app.post('/callback', line.middleware(config), (req, res) => {
  console.log('start');
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// event handler
async function handleEvent(event) {
    const userId = event.source.userId;
  
    if (event.type !== 'message' && event.type !== 'postback') {
      // ignore non-text-message event
      return Promise.resolve(null);
    } else if (event.type === 'postback') {
      if (event.postback.data === 'sticker') {
        //https://developers.line.biz/ja/reference/messaging-api/#sticker-message
        //https://developers.line.biz/ja/docs/messaging-api/sticker-list/#sticker-definitions
        return client.replyMessage(event.replyToken,{
          type: 'sticker',
          packageId: "11537",
          stickerId: "52002735"
        });
      }
    
    } else if (event.message.type === 'text') {
      if (event.message.text === 'flex') {
        //https://developers.line.biz/ja/reference/messaging-api/#flex-message
        return client.replyMessage(event.replyToken,{
          type: 'flex',
          altText: 'item list',
          contents: flexMsg
        });
      } else if (event.message.text === 'quick') {
        //https://developers.line.biz/ja/reference/messaging-api/#quick-reply
        return client.replyMessage(event.replyToken,{
          type: 'text',
          text: 'ステッカー欲しいですか❓YesかNoで答えてください, もしくは素敵な写真送って❗️',
          "quickReply": {
            "items": [
              {
                "type": "action",
                "action": {
                  "type":"postback",
                  "label":"Yes",
                  "data": "sticker",
                  "displayText":"ステッカーください❗️"
                }
              },
              {
                "type": "action",
                "action": {
                  "type":"message",
                  "label":"No",
                  "text":"不要。"
                }
              },
              {
                "type": "action",
                "action": {
                  "type": "camera",
                  "label": "camera"
                }
              }
            ]
          }
        });
      }
    } else if (event.message.type === 'image') {
      //https://developers.line.biz/ja/reference/messaging-api/#image-message
      const blobName = `${crypto.randomBytes(20).toString('hex')}.jpg`;
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      const stream = await client.getMessageContent(event.message.id);
      const data = await getStreamData(stream);
      blockBlobClient.uploadData(data);

      // https://learn.microsoft.com/ja-jp/azure/cognitive-services/computer-vision/quickstarts-sdk/identity-client-library?tabs=visual-studio&pivots=programming-language-javascript
      const face_image_url = `https://${blobServiceClient.accountName}.blob.core.windows.net/files/${blobName}`;
      FaceModels.FaceDetectWithUrlOptionalParams
      const options = new FaceModels.FaceDetectWithUrlOptionalParams({
                returnFaceAttributes: ["Accessories","Age","Blur","Emotion","Exposure","FacialHair","Glasses","Hair","HeadPose","Makeup","Noise","Occlusion","Smile","QualityForRecognition"],
                // We specify detection model 1 because we are retrieving attributes.
                detectionModel: "detection_01",
                recognitionModel: "recognition_03"
      });
      let detected_faces = await client.face.detectWithUrl(face_image_url);
        // {
        //     detectionModel: "detection_03",
        //     recognitionModel : "recognition_04",
        //     returnFaceAttributes: ["mask"]
        // });
      detected_faces.forEach(detected_face => {
        console.log(detected_face);
        console.log(detected_face.faceAttributes);
        console.log(detected_face.faceAttributes.mask);
      });
      const echo = { type: 'text', text: 'マスク' };
      return client.replyMessage(event.replyToken, echo);
      // return client.replyMessage(event.replyToken,{
      //   type: 'image',
      //   originalContentUrl: `https://${blobServiceClient.accountName}.blob.core.windows.net/files/${blobName}`,
      //   previewImageUrl: `https://${blobServiceClient.accountName}.blob.core.windows.net/files/${blobName}`
      // });
    } else if (event.message.type === 'audio') {
      //https://developers.line.biz/ja/reference/messaging-api/#audio-message
      //durationはこれでとれそう？ > https://www.npmjs.com/package/mp3-duration
      const blobName = `${crypto.randomBytes(20).toString('hex')}.mp3`;
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      const stream = await client.getMessageContent(event.message.id);
      const data = await getStreamData(stream);
      const res = blockBlobClient.uploadData(data);
      return client.replyMessage(event.replyToken,{
        type: 'audio',
        originalContentUrl: `https://${blobServiceClient.accountName}.blob.core.windows.net/files/${blobName}`,
        duration: 60000
      });
    } else if (event.message.type === 'location') {
      //https://developers.line.biz/ja/reference/messaging-api/#location-message
      return client.replyMessage(event.replyToken,{
        type: 'location',
        title: 'my location',
        address: event.message.address,
        latitude: event.message.latitude,
        longitude: event.message.longitude
      });
    }
  
    // // Insert
    // const newItem = {
    //   id: userId,
    //   category: "fun",
    //   name: "Cosmos DB",
    //   description: "Complete Cosmos DB Node.js Quickstart ⚡",
    //   isComplete: false
    // };
    // const { resource: createdItem } = await cosmosDBContainer.items.create(newItem);

    // // Query
    // const querySpec = {
    //   query: `SELECT * from c WHERE c.id="${userId}"`
    // };
    // const { resources: items } = await cosmosDBContainer.items
    // .query(querySpec)
    // .fetchAll();
    
    // let description;
    // items.forEach(item => {
    //   description = item.description;
    // });

    // // Update
    // const changeItem = {
    //   id: userId,
    //   category: "fun",
    //   name: "Cosmos DB",
    //   description: "Complete Cosmos DB Node.js Quickstart ⚡",
    //   isComplete: true
    // };

    // const { resource: updatedItem } = await cosmosDBContainer
    // .item(userId)
    // .replace(changeItem);
    
    // const echo = { type: 'text', text: description };

    // create a echoing text message
    const echo = { type: 'text', text: event.message.text };

    // use reply API
    return client.replyMessage(event.replyToken, echo);
}

const getStreamData = async (stream)  => {
    return new Promise(resolve => {
      let result = [];
      stream.on("data", (chunk) => {
        result.push(Buffer.from(chunk));
      });
      stream.on("end", () => {
        resolve(Buffer.concat(result));
      });
    });
}

//https://developers.line.biz/flex-simulator/
const flexMsg = {
    "type": "carousel",
    "contents": [
      {
        "type": "bubble",
        "hero": {
          "type": "image",
          "size": "full",
          "aspectRatio": "20:13",
          "aspectMode": "cover",
          "url": "https://scdn.line-apps.com/n/channel_devcenter/img/fx/01_5_carousel.png"
        },
        "body": {
          "type": "box",
          "layout": "vertical",
          "spacing": "sm",
          "contents": [
            {
              "type": "text",
              "text": "Arm Chair, White",
              "wrap": true,
              "weight": "bold",
              "size": "xl"
            },
            {
              "type": "box",
              "layout": "baseline",
              "contents": [
                {
                  "type": "text",
                  "text": "$49",
                  "wrap": true,
                  "weight": "bold",
                  "size": "xl",
                  "flex": 0
                },
                {
                  "type": "text",
                  "text": ".99",
                  "wrap": true,
                  "weight": "bold",
                  "size": "sm",
                  "flex": 0
                }
              ]
            }
          ]
        },
        "footer": {
          "type": "box",
          "layout": "vertical",
          "spacing": "sm",
          "contents": [
            {
              "type": "button",
              "style": "primary",
              "action": {
                "type": "uri",
                "label": "Add to Cart",
                "uri": "https://linecorp.com"
              }
            },
            {
              "type": "button",
              "action": {
                "type": "uri",
                "label": "Add to wishlist",
                "uri": "https://linecorp.com"
              }
            }
          ]
        }
      },
      {
        "type": "bubble",
        "hero": {
          "type": "image",
          "size": "full",
          "aspectRatio": "20:13",
          "aspectMode": "cover",
          "url": "https://scdn.line-apps.com/n/channel_devcenter/img/fx/01_6_carousel.png"
        },
        "body": {
          "type": "box",
          "layout": "vertical",
          "spacing": "sm",
          "contents": [
            {
              "type": "text",
              "text": "Metal Desk Lamp",
              "wrap": true,
              "weight": "bold",
              "size": "xl"
            },
            {
              "type": "box",
              "layout": "baseline",
              "flex": 1,
              "contents": [
                {
                  "type": "text",
                  "text": "$11",
                  "wrap": true,
                  "weight": "bold",
                  "size": "xl",
                  "flex": 0
                },
                {
                  "type": "text",
                  "text": ".99",
                  "wrap": true,
                  "weight": "bold",
                  "size": "sm",
                  "flex": 0
                }
              ]
            },
            {
              "type": "text",
              "text": "Temporarily out of stock",
              "wrap": true,
              "size": "xxs",
              "margin": "md",
              "color": "#ff5551",
              "flex": 0
            }
          ]
        },
        "footer": {
          "type": "box",
          "layout": "vertical",
          "spacing": "sm",
          "contents": [
            {
              "type": "button",
              "flex": 2,
              "style": "primary",
              "color": "#aaaaaa",
              "action": {
                "type": "uri",
                "label": "Add to Cart",
                "uri": "https://linecorp.com"
              }
            },
            {
              "type": "button",
              "action": {
                "type": "uri",
                "label": "Add to wish list",
                "uri": "https://linecorp.com"
              }
            }
          ]
        }
      },
      {
        "type": "bubble",
        "body": {
          "type": "box",
          "layout": "vertical",
          "spacing": "sm",
          "contents": [
            {
              "type": "button",
              "flex": 1,
              "gravity": "center",
              "action": {
                "type": "uri",
                "label": "See more",
                "uri": "https://linecorp.com"
              }
            }
          ]
        }
      }
    ]
  }

// listen on port
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`listening on ${port}`);
});