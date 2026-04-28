import { KwirthData, versionGreaterThan } from "@kwirthmagnify/kwirth-common"
import { ELogComponent, logInfo, logWarning } from "../Logging"

export const getLastKwirthVersion = async (kwirthData:KwirthData) : Promise<string|undefined> => {
    kwirthData.lastVersion=kwirthData.version
    try {
        var hubResp = await fetch ('https://hub.docker.com/v2/repositories/kwirthmagnify/kwirth/tags?page_size=25&page=1&ordering=last_updated&name=')
        var json = await hubResp.json()
        if (json) {
            var results=json.results as any[]
            for (var result of results) {
                var regex = /^\d+\.\d+\.\d+$/
                if (regex.test(result.name)) {
                    if (versionGreaterThan(result.name, kwirthData.version)) {
                        logWarning(ELogComponent.CORE, `************************************************`)
                        logWarning(ELogComponent.CORE, `************************************************`)
                        logWarning(ELogComponent.CORE, `** New Kwirth version available: ${(result.name+'          ').substring(0,10)} **`)
                        logWarning(ELogComponent.CORE, `************************************************`)
                        logWarning(ELogComponent.CORE, `************************************************`)
                        return result.name
                    }
                }
            }
            logInfo(ELogComponent.CORE, 'No new Kwirth version found on Docker hub')
        }
    }
    catch (err) {
        logInfo(ELogComponent.CORE, 'Error trying to determine last Kwirth version')
        logInfo(ELogComponent.CORE, err)
    }
    return undefined
}

export const showLogo = () => {
    console.log('                                                                                                                        ')
    console.log('                                                                                                                        ')
    console.log('                                                 .%#@@@++==@@@@@@@@@-                                                   ')
    console.log('                                              .@*-+%               @@@@                                                 ')
    console.log('                                             #%-.+#                    @@@@                                             ')
    console.log('                                            -%:.=@                   @@@@..*                                            ')
    console.log('                                          :@*::.@  @              @@ @@*@*: =.                                          ')
    console.log('                                           .:...@ .@@              %          @@                                        ')
    console.log('                                         @@@@@@@%*@         :.:+@@#%@@++       @@                                       ')
    console.log('                                        @@       :..@@%%@@@#*++=:....:-=+#%@@=  *-                                      ')
    console.log('                                                  -+:::::...::::::::::::::..:+%#@@-                                     ')
    console.log('                                           .@.=@%+::.::::::::::::::::::::::::.:.-%@*                                    ')
    console.log('                                          :@-%+:..:::::::::::::::::::::::::::::.@ :@                                    ')
    console.log('                                          .@-...::::::::::::::::::::::::::::::: @ %@                                    ')
    console.log('                                            ==.:::::::::::::::::::::::::::::::: @                                       ')
    console.log('                                            .+...::::::::::::::::::::::::::::::.@                                       ')
    console.log('                                            .++=.::::::::::::::::::::::::::::::.%                                       ')
    console.log('                                           =@  ::.:::::::...:::...::::::::......%                                       ')
    console.log('                                          .@.:@@@@@#####%@@*:..=%@@@%##%%@@@@@@%@                                       ')
    console.log('                                        @@                 .@@@%                  =@%@                                  ')
    console.log('                                       .+#.                                     @%+.@@:                                 ')
    console.log('                                       #+:@     @        @  -@  @# @@@@   @@@@@@-:: :@@                                 ')
    console.log('                                        @.-*@@ #@%@@@+=%@@ -%=*##++-  .=#+:.......   @                                  ')
    console.log('                                        @-...@  .........  :=::::::::....:::::::.%@: @                                  ')
    console.log('                                         @.*- .@@+-:-*#%#%@*:::::::::---:-::::::. @=-=                                  ')
    console.log('                                         *::#-  .:=-=::.*= %:::::::::-==-::::::::.:.@                                   ')
    console.log('                                          @:-+:........:=  %:.....:::....::::::::.:*.                                   ')
    console.log('                                          %#*@@=::::::.=@  @@-.=. .:::::::::::::-*@*                                    ')
    console.log('                                            %. =:::::::-*     =@@#.::::::::::::=@                 @@@@@@*               ')
    console.log('  @@@@@@@@@.   @@@@@@@                         --::::...+-@@@@:   .:::::::::::-@                     @@@.               ')
    console.log('     @@@         @@:                           %=:::+*@:: @@@@+ ..::::::::::::@                      @@@.               ')
    console.log('     @@@       @@@                             :-   * @=%#    .++-:.     ..:...        @@@           @@@.               ')
    console.log('     @@@      @@                            .@      .            ..                    @@@           @@@.               ')
    console.log('     @@@    @@@          @@@@@@@@.     @@@ @@@@@@@@@@@@@@@@@@@@=#+:+@@@@@@ +@@@@@   @@@@@@@@@@@*     @@@  =@@@@@@@@     ')
    console.log('     @@@  +@@               @@@       +@@@@.      @:  #    @@@  :..   @@@@@@@  @@      @@@           @@@%@@.    @@@@    ')
    console.log('     @@@.@@                 @@@@      @@@@@  @ . @@        @@@  +:::: @@@@             @@@           @@@@        @@@    ')
    console.log('     @@@=@@@@                @@@     @@ .@@.    @@%       @@@@  .:::: @@@@ =.          @@@           @@@         @@@    ')
    console.log('     @@@  =@@@@              @@@@%@@@@   @@@    @@ -@+    @@@@  ..... @@@@ =  .        @@@           @@@         @@@    ')
    console.log('     @@@    @@@@.             @@@   @%    @@@  @@    %@-   @@@**@@@%@ @@@@ =  @@@@@@@  @@@           @@@         @@@    ')
    console.log('     @@@     .@@@@            @@@@ @@     @@@  @. .@. :@   @@@      % @@@@ +       .   @@@           @@@         @@@    ')
    console.log('     @@@       @@@@@           @@@@@       @@@@@    @. :* =@@@      @ @@@@             @@@           @@@         @@@    ')
    console.log('     @@@         @@@@          @@@@        *@@@      @     @@@      = @@@@             @@@@          @@@         @@@    ')
    console.log('  @@@@@@@@@     @@@@@@@@@       @@@         @@@      @@@@@@@@@@@@   @@@@@@@@@           @@@@@@@=  @@@@@@@@@   @@@@@@@@@ ')
    console.log('                                                                                                                        ')
    console.log('                                                https://kwirthmagnify.dev                                               ')
    console.log('                                                                                                                        ')
    console.log('                                                                                                                        ')    
}