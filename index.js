require('dotenv').config({path: '.env', quiet: true})
const fs = require('fs')
const mime = require('mime')
const path = require('path');
const fsPromises = require('fs/promises')
const nullthrows = require('nullthrows')
const fastify = require('fastify')({
  logger: true
})

const {
  UpdateType,
  getLatestUpdateBundlePathForRuntimeVersionAsync,
  getTypeOfUpdateAsync,
  putUpdateInResponseAsync,
  putRollBackInResponseAsync,
  putNoUpdateAvailableInResponseAsync,
  getMetadataAsync,
} = require('./helpers')

/**
 * HOOKS 
 */
fastify.addHook('preValidation', async (req, reply) => {
  if (req.url && req.url !== '/') {
    console.log(`Request [${req.method ?? ''}][${req.url ?? ''}] headers`, JSON.stringify(req.headers))
  }
})
fastify.addHook('onSend', async (req, reply, payload) => {
  if (req.url && req.url !== '/') {
    console.log(`Response [${req.method ?? ''}][${req.url ?? ''}] payload`, payload)
  }
  return payload;
})



fastify.get('/', function (req, reply) {
  reply.send({ hello: 'world' })
})

fastify.get('/manifest', async (req, reply) => {
  if (req.method?.toUpperCase() !== 'GET') {
    return reply.code(405).send({ msg: 'Expected GET.' })
  }

  const protocolVersionMaybeArray = req.headers['expo-protocol-version'];  
  if (protocolVersionMaybeArray && Array.isArray(protocolVersionMaybeArray)) {
    return reply.code(400).send({ msg: 'Unsupported protocol version. Expected either 0 or 1.' })
  }
  const protocolVersion = parseInt(protocolVersionMaybeArray ?? '0', 10);

  const platform = req.headers['expo-platform'] ?? req.query['platform'];
  if (platform !== 'ios' && platform !== 'android') {
    return reply.code(400).send({ msg: 'Unsupported platform. Expected either ios or android.' })
  }

  const runtimeVersion = req.headers['expo-runtime-version'] ?? req.query['runtime-version'];
  if (!runtimeVersion || typeof runtimeVersion !== 'string') {
    return reply.code(400).send({ msg: 'No runtimeVersion provided.' })
  }

  let updateBundlePath;
  try {
    updateBundlePath = await getLatestUpdateBundlePathForRuntimeVersionAsync(runtimeVersion);
  } catch (error) {
    console.log(`controller/update/getLatestUpdate...:[ ${JSON.stringify(error.message)} ]`)
    return reply.status(404).send({ msg: 'Unable to get latest update' })
  }

  let updateType = await getTypeOfUpdateAsync(updateBundlePath);
  
  try {
    try {
      if (updateType === UpdateType.NORMAL_UPDATE) {
        await putUpdateInResponseAsync(
          req,
          reply,
          updateBundlePath,
          runtimeVersion,
          platform,
          protocolVersion
        );
      } else if (updateType === UpdateType.ROLLBACK) {
        await putRollBackInResponseAsync(req, reply, updateBundlePath, protocolVersion);
      }
    } catch (maybeNoUpdateAvailableError) {
      if (maybeNoUpdateAvailableError.message === 'NoUpdateAvailable') {
        await putNoUpdateAvailableInResponseAsync(req, reply, protocolVersion);
        return;
      }
      throw maybeNoUpdateAvailableError;
    }
  } catch (error) {
    console.log(`controller/update/error:[ ${JSON.stringify(error.message)} ]`)
    return reply.status(404).send({ msg: error.message })
  }
})

fastify.get('/assets', async (req, reply) => {
  const { asset: assetName, runtimeVersion, platform } = req.query;

  if (!assetName || typeof assetName !== 'string') {
    return reply.status(400).send({ msg: 'No asset name provided.' });
  }

  if (platform !== 'ios' && platform !== 'android') {
    return reply.status(400).send({ msg: 'No platform provided. Expected "ios" or "android".' });
  }

  if (!runtimeVersion || typeof runtimeVersion !== 'string') {
    return reply.status(400).send({ msg: 'No runtimeVersion provided.' });
  }

  let updateBundlePath;
  try {
    updateBundlePath = await getLatestUpdateBundlePathForRuntimeVersionAsync(runtimeVersion);
  } catch (error) {
    return reply.status(404).send({ msg: error.message });
  }

  const { metadataJson } = await getMetadataAsync({
    updateBundlePath,
    runtimeVersion,
  });

  const assetPath = path.resolve(assetName);
  const assetMetadata = metadataJson.fileMetadata[platform].assets.find(
    (asset) => asset.path === assetName.replace(`${updateBundlePath}/`, '')
  );
  const isLaunchAsset =
    metadataJson.fileMetadata[platform].bundle === assetName.replace(`${updateBundlePath}/`, '');

  if (!fs.existsSync(assetPath)) {
    return reply.status(404).send({ msg: `Asset "${assetName}" does not exist.` });
  }

  try {
    const asset = await fsPromises.readFile(assetPath, null);

    reply
      .status(200)
      .header('content-type', isLaunchAsset ? 'application/javascript' : nullthrows(mime.getType(assetMetadata.ext)))
      .send(asset);
  } catch (error) {
    console.log(`controller/asset/error:[ ${JSON.stringify(error.message)} ]`)
    return reply.status(500).send({ msg: error.message })
  }
})

// Run the server!
fastify.listen({ host: process.env.SERVER_HOST, port: process.env.SERVER_PORT }, function (err, address) {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
  // Server is now listening on ${address}
})