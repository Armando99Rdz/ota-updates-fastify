# OTA Updates Server
This project is based on [custom-expo-updates](https://github.com/expo/custom-expo-updates-server/tree/main) server.


### code-signing keys & certificates
1. On Expo app root dir you have to use `expo-updates` package to generates code-signing `.pem` files (_public key, private key & certificate_).
```bash
npx expo-updates codesigning:generate \
  --key-output-directory /path/server/code-signing-keys \
  --certificate-output-directory certs \
  --certificate-validity-duration-years 10 \
  --certificate-common-name "Your Organization Name"
```
2. Copy the recommended command from last output. It can be like:
```bash
expo-updates codesigning:configure \
  --certificate-input-directory=./code-signing \
  --key-input-directory=/path/server/code-signing-keys
```
> NOTE: If last command fails, just need to copy the recommended code to [Expo App Config](https://docs.expo.dev/versions/latest/config/app/) file.

3. According to [Expo docs](https://docs.expo.dev/versions/latest/config/app/) about `expo-updates` testing you need to build the app on release mode. Force close the app and re-open it. It should make a request to `/manifest`, then requests to `/assets`. After the app loads, it should show any changes you made locally.


### troubleshooting
##### iOS does not calls update-server
Expo-Updates have an [issue](https://github.com/expo/expo/issues/33979) when generate `Expo.plist` file (app)
