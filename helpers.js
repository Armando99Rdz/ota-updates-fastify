const crypto = require('crypto');
const fsSync = require('fs');
const fs = require('fs/promises');
const mime = require('mime');
const path = require('path');
const FormData = require('form-data');
const {serializeDictionary} = require('structured-headers');

/**
 * @param {Buffer} file 
 * @param {string} hashingAlgorithm 
 * @param {import('crypto').BinaryToTextEncoding} encoding 
 * @returns {string}
 */
function createHash(file, hashingAlgorithm, encoding) {
  return crypto.createHash(hashingAlgorithm).update(file).digest(encoding);
}

/**
 * @param {string} base64EncodedString 
 * @returns {string}
 */
function getBase64URLEncoding(base64EncodedString) {
  return base64EncodedString.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * 
 * @param {{[k: string]: string}} obj 
 * @returns {import('structured-headers').Dictionary}
 */
exports.convertToDictionaryItemsRepresentation = async (obj) => {
  return new Map(
    Object.entries(obj).map(([k, v]) => {
      return [k, [v, new Map()]];
    })
  );
}

/**
 * @param {string} data 
 * @param {string} privateKey 
 * @returns {string}
 */
exports.signRSASHA256 = (data, privateKey) => {
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(data, 'utf8');
  sign.end();
  return sign.sign(privateKey, 'base64');
}

exports.getPrivateKeyAsync = async () => {
  const privateKeyPath = process.env.PRIVATE_KEY_PATH;
  if (!privateKeyPath) {
    return null;
  }

  const pemBuffer = await fs.readFile(path.resolve(privateKeyPath));
  return pemBuffer.toString('utf8');
}

/**
 * @param {string} runtimeVersion 
 * @returns {Promise<string>}
 */
exports.getLatestUpdateBundlePathForRuntimeVersionAsync = async (runtimeVersion) => {
  const updatesDirectoryForRuntimeVersion = path.join(__dirname, `updates/${runtimeVersion}`);
  if (!fsSync.existsSync(updatesDirectoryForRuntimeVersion)) {
    throw new Error('Unsupported runtime version');
  }

  const filesInUpdatesDirectory = await fs.readdir(updatesDirectoryForRuntimeVersion);
  const directoriesInUpdatesDirectory = (
    await Promise.all(
      filesInUpdatesDirectory.map(async (file) => {
        const fileStat = await fs.stat(path.join(updatesDirectoryForRuntimeVersion, file));
        return fileStat.isDirectory() ? file : null;
      })
    )
  ).filter(it => !!it)
  
  const cleanUpdateDirname = dir => dir.replace(/\D/g, '') ?? ''

  const sortedUpdatesDirectories = directoriesInUpdatesDirectory
    .map(cleanUpdateDirname)
    .sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
  const mostRecentUpdateDirectory = directoriesInUpdatesDirectory.find(it => cleanUpdateDirname(it) === sortedUpdatesDirectories[0])

  return path.join(updatesDirectoryForRuntimeVersion, mostRecentUpdateDirectory);
}

/**
 * @typedef GetAssetMetadataArg
 * @property {string} updateBundlePath
 * @property {string} filePath
 * @property {string | null} ext
 * @property {boolean} isLaunchAsset
 * @property {string} runtimeVersion
 * @property {string} platform
 */

/**
 * 
 * @param {GetAssetMetadataArg} arg 
 * @returns {Promise<any>}
 */
exports.getAssetMetadataAsync = async (arg) => {
  const assetFilePath = `${arg.updateBundlePath}/${arg.filePath}`;
  const asset = await fs.readFile(path.resolve(assetFilePath), null);
  const assetHash = getBase64URLEncoding(createHash(asset, 'sha256', 'base64'));
  const key = createHash(asset, 'md5', 'hex');
  const keyExtensionSuffix = arg.isLaunchAsset ? 'bundle' : arg.ext;
  const contentType = arg.isLaunchAsset ? 'application/javascript' : mime.getType(arg.ext);
  const hostname = `${process.env.SERVER_HTTP_PROTOCOL}://${process.env.SERVER_HOST}${process.env.SERVER_PORT ? `:${process.env.SERVER_PORT}` : ''}`

  return {
    hash: assetHash,
    key,
    fileExtension: `.${keyExtensionSuffix}`,
    contentType,
    url: `${hostname}/assets?asset=${assetFilePath}&runtimeVersion=${arg.runtimeVersion}&platform=${arg.platform}`,
  };
}

/**
 * @param {string} updateBundlePath 
 * @returns {Promise<{type: string, paremeters: {[k: string]: any}} | void>}
 */
exports.createRollBackDirectiveAsync = async (updateBundlePath) => {
  try {
    const rollbackFilePath = `${updateBundlePath}/rollback`;
    const rollbackFileStat = await fs.stat(rollbackFilePath);
    return {
      type: 'rollBackToEmbedded',
      parameters: {
        commitTime: new Date(rollbackFileStat.birthtime).toISOString(),
      },
    };
  } catch (error) {
    throw new Error(`No rollback found. Error: ${error}`);
  }
}

/**
 * @param {string} updateBundlePath 
 * @returns {Promise<{type: string}>}
 */
exports.createNoUpdateAvailableDirectiveAsync = async () => {
  return {
    type: 'noUpdateAvailable',
  };
}

/**
 * @param {{updateBundlePath: string; runtimeVersion: string;}} param 
 * @returns {Promise<{metadataJson: any; createdAt: number; id: string;}>}
 */
exports.getMetadataAsync = async ({ updateBundlePath, runtimeVersion, }) => {
  try {
    const metadataPath = `${updateBundlePath}/metadata.json`;
    const updateMetadataBuffer = await fs.readFile(path.resolve(metadataPath), null);
    const metadataJson = JSON.parse(updateMetadataBuffer.toString('utf-8'));
    const metadataStat = await fs.stat(metadataPath);

    return {
      metadataJson,
      createdAt: new Date(metadataStat.birthtime).toISOString(),
      id: createHash(updateMetadataBuffer, 'sha256', 'hex'),
    };
  } catch (error) {
    throw new Error(`No update found with runtime version: ${runtimeVersion}. Error: ${error}`);
  }
}

/**
 * This adds the `@expo/config`-exported config to `extra.expoConfig`, which is a common thing
 * done by implementors of the expo-updates specification since a lot of Expo modules use it.
 * It is not required by the specification, but is included here in the example client and server
 * for demonstration purposes. EAS Update does something conceptually very similar.
 * @param {{updateBundlePath: string; runtimeVersion: string;}} param 
 * @returns {Promise<any>}
 */
exports.getExpoConfigAsync = async ({ updateBundlePath, runtimeVersion, }) => {
  try {
    const expoConfigPath = `${updateBundlePath}/expoConfig.json`;
    const expoConfigBuffer = await fs.readFile(path.resolve(expoConfigPath), null);
    const expoConfigJson = JSON.parse(expoConfigBuffer.toString('utf-8'));
    return expoConfigJson;
  } catch (error) {
    throw new Error(
      `No expo config json found with runtime version: ${runtimeVersion}. Error: ${error}`
    );
  }
}

/**
 * @param {string} value 
 * @returns {string}
 */
exports.convertSHA256HashToUUID = (value) => {
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(
    16,
    20
  )}-${value.slice(20, 32)}`;
}


/**
 * @enum {number}
 */
const UpdateType = {
  'NORMAL_UPDATE': 0,
  'ROLLBACK': 1,
}
exports.UpdateType = UpdateType

/**
 * 
 * @param {string} updateBundlePath 
 * @returns {Promise<UpdateType>}
 */
exports.getTypeOfUpdateAsync = async (updateBundlePath) => {
  const directoryContents = await fs.readdir(updateBundlePath);
  return directoryContents.includes('rollback') ? UpdateType.ROLLBACK : UpdateType.NORMAL_UPDATE;
}


/**
 * @param {import('fastify').FastifyRequest} req 
 * @param {import('fastify').FastifyReply} reply
 * @param {string} updateBundlePath 
 * @param {string} runtimeVersion 
 * @param {string} platform 
 * @param {number} protocolVersion 
 * @returns {Promise<void>}
 */
exports.putUpdateInResponseAsync = async (req, reply, updateBundlePath, runtimeVersion, platform, protocolVersion) => {
  const currentUpdateId = req.headers['expo-current-update-id'];
  const { metadataJson, createdAt, id } = await this.getMetadataAsync({
    updateBundlePath,
    runtimeVersion,
  });

  // NoUpdateAvailable directive only supported on protocol version 1
  // for protocol version 0, serve most recent update as normal
  if (currentUpdateId === this.convertSHA256HashToUUID(id) && protocolVersion === 1) {
    throw new Error('NoUpdateAvailable');
  }

  const updateTimestamp = updateBundlePath.split('/').pop() ?? ''
  const updateRelativePath = updateBundlePath.split('/').slice(-3).join('/');

  const expoConfig = await this.getExpoConfigAsync({
    updateBundlePath,
    runtimeVersion,
  });
  const platformSpecificMetadata = metadataJson.fileMetadata[platform];
  const manifest = {
    id: this.convertSHA256HashToUUID(id),
    createdAt,
    runtimeVersion,
    assets: await Promise.all(
      (platformSpecificMetadata.assets).map((asset) =>
        this.getAssetMetadataAsync({
          updateBundlePath,
          filePath: asset.path,
          ext: asset.ext,
          runtimeVersion,
          platform,
          isLaunchAsset: false,
        })
      )
    ),
    launchAsset: await this.getAssetMetadataAsync({
      updateBundlePath,
      filePath: platformSpecificMetadata.bundle,
      isLaunchAsset: true,
      runtimeVersion,
      platform,
      ext: null,
    }),
    metadata: {
      updateTimestamp,
      updateRelativePath,
    },
    extra: {
      expoClient: expoConfig,
    },
  };

  let signature = null;
  const expectSignatureHeader = req.headers['expo-expect-signature'];
  if (expectSignatureHeader) {
    const privateKey = await this.getPrivateKeyAsync();
    if (!privateKey) {
      return reply.status(400).send({ msg: 'Code signing requested but no key supplied when starting server.' })
    }
    const manifestString = JSON.stringify(manifest);
    const hashSignature = this.signRSASHA256(manifestString, privateKey);
    const dictionary = this.convertToDictionaryItemsRepresentation({
      sig: hashSignature,
      keyid: 'main',
    });
    signature = serializeDictionary(dictionary);
  }

  const assetRequestHeaders = {};
  [...manifest.assets, manifest.launchAsset].forEach((asset) => {
    assetRequestHeaders[asset.key] = {
      'test-header': 'test-header-value',
    };
  });

  const form = new FormData();
  form.append('manifest', JSON.stringify(manifest), {
    contentType: 'application/json',
    header: {
      'content-type': 'application/json; charset=utf-8',
      ...(signature ? { 'expo-signature': signature } : {}),
    },
  });

  form.append('extensions', JSON.stringify({ assetRequestHeaders }), {
    contentType: 'application/json',
  });

  reply
    .code(200)
    .header('expo-protocol-version', protocolVersion)
    .header('expo-sfv-version', 0)
    .header('cache-control', 'private, max-age=0')
    .header('content-type', `multipart/mixed; boundary=${form.getBoundary()}`)
    
  return reply.send(form.getBuffer());
}



/**
 * @param {import('fastify').FastifyRequest} req 
 * @param {import('fastify').FastifyReply} reply
 * @param {string} updateBundlePath
 * @param {number} protocolVersion 
 * @returns {Promise<void>}
 */
exports.putRollBackInResponseAsync = async (req, reply, updateBundlePath, protocolVersion) => {
  if (protocolVersion === 0) {
    throw new Error('Rollbacks not supported on protocol version 0');
  }

  const embeddedUpdateId = req.headers['expo-embedded-update-id'];
  if (!embeddedUpdateId || typeof embeddedUpdateId !== 'string') {
    throw new Error('Invalid Expo-Embedded-Update-ID request header specified.');
  }

  const currentUpdateId = req.headers['expo-current-update-id'];
  if (currentUpdateId === embeddedUpdateId) {
    throw new Error('NoUpdateAvailable');
  }

  const directive = await this.createRollBackDirectiveAsync(updateBundlePath);

  let signature = null;
  const expectSignatureHeader = req.headers['expo-expect-signature'];
  if (expectSignatureHeader) {
    const privateKey = await this.getPrivateKeyAsync();
    if (!privateKey) {
      return reply.status(400).send({ msg: 'Code signing requested but no key supplied when starting server.' });
    }
    const directiveString = JSON.stringify(directive);
    const hashSignature = this.signRSASHA256(directiveString, privateKey);
    const dictionary = this.convertToDictionaryItemsRepresentation({
      sig: hashSignature,
      keyid: 'main',
    });
    signature = serializeDictionary(dictionary);
  }

  const form = new FormData();
  form.append('directive', JSON.stringify(directive), {
    contentType: 'application/json',
    header: {
      'content-type': 'application/json; charset=utf-8',
      ...(signature ? { 'expo-signature': signature } : {}),
    },
  });

  return reply
    .code(200)
    .header('expo-protocol-version', 1)
    .header('expo-sfv-version', 0)
    .header('cache-control', 'private, max-age=0')
    .header('content-type', `multipart/mixed; boundary=${form.getBoundary()}`)
    .send(form.getBuffer());
}



/**
 * @param {import('fastify').FastifyRequest} req 
 * @param {import('fastify').FastifyReply} reply
 * @param {number} protocolVersion 
 * @returns {Promise<void>}
 */
exports.putNoUpdateAvailableInResponseAsync = async (req, reply, protocolVersion) => {
  if (protocolVersion === 0) {
    throw new Error('NoUpdateAvailable directive not available in protocol version 0');
  }

  const directive = await this.createNoUpdateAvailableDirectiveAsync();

  let signature = null;
  const expectSignatureHeader = req.headers['expo-expect-signature'];
  if (expectSignatureHeader) {
    const privateKey = await this.getPrivateKeyAsync();
    if (!privateKey) {
      return reply.status('400').send({ msg: 'Code signing requested but no key supplied when starting server.' })
    }

    const directiveString = JSON.stringify(directive);
    const hashSignature = this.signRSASHA256(directiveString, privateKey);
    const dictionary = this.convertToDictionaryItemsRepresentation({
      sig: hashSignature,
      keyid: 'main',
    });
    signature = serializeDictionary(dictionary);
  }

  const form = new FormData();
  form.append('directive', JSON.stringify(directive), {
    contentType: 'application/json',
    header: {
      'content-type': 'application/json; charset=utf-8',
      ...(signature ? { 'expo-signature': signature } : {}),
    },
  });

  return reply
    .code(200)
    .header('expo-protocol-version', 1)
    .header('expo-sfv-version', 0)
    .header('cache-control', 'private, max-age=0')
    .header('content-type', `multipart/mixed; boundary=${form.getBoundary()}`)
    .send(form.getBuffer());
}