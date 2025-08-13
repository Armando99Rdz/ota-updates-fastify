# by @ArmandoRdz
source .env

RESET='\033[0m'
BOLD='\033[1m'
LIGHT='\033[2m' 

GRAY='\033[2;37m'
GREEN='\033[32m'
YELLOW='\033[33m'


# -----------------------------------
ARG_ROLLBACK="r"
ARG_NEW_VERSION="p"

while getopts d: flag
do
    case "${flag}" in
        d) ARG=${OPTARG};;
    esac
done

# -----------------------------------
echo "${BOLD}APP PATH:${RESET} $APP_PATH"
echo "${BOLD}SERVER PATH:${RESET} $SERVER_PATH ${RESET}"
if [[ "${ARG:-}" == "$ARG_NEW_VERSION" ]]; then
    echo "${YELLOW}Rollback Version ${RESET}"
elif [[ "${ARG:-}" == "$ARG_ROLLBACK" ]]; then
    echo "New Version ${RESET}"
fi
echo ""


# -----------------------------------
# user input
echo "> Enter the version ID: ${LIGHT}${GRAY}1.0.0(1), 1755037367, 100, etc.${RESET}${GREEN}"
read versionId
echo "${RESET}"

if [[ "${ARG:-}" == "$ARG_NEW_VERSION" ]]; then
    updateDir="updates/$versionId/$(date +%s)"
elif [[ "${ARG:-}" == "$ARG_ROLLBACK" ]]; then
    updateDir="updates/$versionId/$(date +%s)/rollback"
fi

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

if [[ "${ARG:-}" == "$ARG_NEW_VERSION" ]]; then
    
    echo "${GREEN}${BOLD}DONE ${RESET}${BOLD}New version published"
    echo ""
    
elif [[ "${ARG:-}" == "$ARG_ROLLBACK" ]]; then

    echo "${GREEN}${BOLD}DONE ${RESET}${BOLD}Rollback version published"
    echo ""
fi
