# by @ArmandoRdz
source .env

RESET='\033[0m'
BOLD='\033[1m'
LIGHT='\033[2m' 

GRAY='\033[2;37m'
GREEN='\033[32m'
YELLOW='\033[33m'

# -----------------------------------
echo "${BOLD}APP PATH:${RESET} $APP_PATH"
echo "${BOLD}SERVER PATH:${RESET} $SERVER_PATH"
echo ""

# bash args
# while getopts d: flag
# do
#     case "${flag}" in
#         d) directory=${OPTARG};;
#     esac
# done

# -----------------------------------
# user input
echo "> Enter the version ID: ${LIGHT}${GRAY}1.0.0(1), 1755037367, 100, etc.${RESET}${GREEN}"
read versionId
echo "${RESET}"

updateDir="updates/$versionId.$(date +%s)"

if [[ -d "$updateDir" ]]; then
    echo "⚠️  ${YELLOW}Al parecer ya existe una version con este ID. (${updateDir}) ${RESET}"
    exit 1
fi

# Prepare app expo version
cd $APP_PATH
npx expo export
# Generate update files on server-side 
cd $SERVER_PATH
echo "Creando dir $updateDir ..."
mkdir -p "$updateDir"

cp -r $APP_PATH/dist/ $updateDir

node ./scripts/exportClientExpoConfig.js $APP_PATH $SERVER_PATH > $updateDir/expoConfig.json
echo "Done!"