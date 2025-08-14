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
    echo "New Version ${RESET}"
elif [[ "${ARG:-}" == "$ARG_ROLLBACK" ]]; then
    echo "${YELLOW}Rollback Version ${RESET}"
fi
echo ""


updateTimestamp="$(date +%s)"


# -----------------------------------
# user input
echo "> Enter the runtime version: ${LIGHT}${GRAY}1.0.0(1), 3.16 , 200, etc.${RESET}${GREEN}"
read runtimeVersion
echo "${RESET}"

if [[ ! $runtimeVersion =~ ^[[:alnum:]_().-]+$ ]]; then
    echo "⚠️  ${YELLOW}El valor ${BOLD}'${runtimeVersion}' ${RESET}${YELLOW}para runtimeVersion inválido.${RESET}"
    exit 1
fi


if [[ "${ARG:-}" == "$ARG_NEW_VERSION" ]]; then
    updateDir="updates/$runtimeVersion/$updateTimestamp"
elif [[ "${ARG:-}" == "$ARG_ROLLBACK" ]]; then
    updateDir="updates/$runtimeVersion/${updateTimestamp}r"

    echo "> Enter update timestamp to bring front: ${LIGHT}${GRAY}Debe ser anterior a la última${RESET}${GREEN}"
    read rollbackUpdateTimestamp
    echo "${RESET}"

    rollbackUpdatePath="updates/$runtimeVersion/${rollbackUpdateTimestamp}"
    if [[ ! -d "$rollbackUpdatePath" ]]; then
        echo "⚠️  ${YELLOW}No existe la versión seleccionada a retroceder ($rollbackUpdatePath).${RESET}"
        exit 1
    fi
fi



if [[ "${ARG:-}" == "$ARG_NEW_VERSION" ]]; then # -------- PUBLISHING NEW VERSION --------

    cd $APP_PATH # Prepare app expo version
    npx expo export

    cd $SERVER_PATH # Generate update files on server-side 
    echo "Creando dir $updateDir ..."
    mkdir -p "$updateDir"
    cp -r $APP_PATH/dist/ $updateDir

    node ./scripts/exportClientExpoConfig.js $APP_PATH $SERVER_PATH > $updateDir/expoConfig.json
    
    echo "${GREEN}${BOLD}DONE ${RESET}${BOLD}New version published"
    echo ""
    

elif [[ "${ARG:-}" == "$ARG_ROLLBACK" ]]; then # -------- PUBLISHING ROLLBACK VERSION --------

    cd $SERVER_PATH
    echo "Creando dir $updateDir ..."
    mkdir -p "$updateDir"

    cp -r $rollbackUpdatePath/* $updateDir

    updateJsonFile="$updateDir/update.json"
    touch "$updateJsonFile"
    echo "{ \"rollbackRuntimeVersion\": \"$runtimeVersion\", \"rollbackUpdateTimestamp\": \"$rollbackUpdateTimestamp\" }" > "$updateJsonFile"

    echo "${GREEN}${BOLD}DONE ${RESET}${BOLD}Rollback version published"
    echo ""
fi
