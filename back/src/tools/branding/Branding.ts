import { KwirthData, versionGreaterThan } from "@kwirthmagnify/kwirth-common"

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
                        console.log(`************************************************`)
                        console.log(`************************************************`)
                        console.log(`** New Kwirth version available: ${(result.name+'          ').substring(0,10)} **`)
                        console.log(`************************************************`)
                        console.log(`************************************************`)
                        return result.name
                    }
                }
            }
            console.log('No new Kwirth version found on Docker hub')
        }
    }
    catch (err) {
        console.log('Error trying to determine last Kwirth version')
        console.log(err)
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