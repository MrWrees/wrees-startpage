{ config, lib, options, pkgs, ... }:
let
  cfg = config.programs.wrees-startpage;
  extensionId = "startpage@wrees";
  hostName = "io.github.wrees.startpage";
  xpiSource = "${cfg.xpi}";
  checkedXpi = pkgs.runCommand "wrees-startpage-signed.xpi" {
    nativeBuildInputs = [ pkgs.python3 ];
  } ''
    python3 -I -B ${../scripts/verify_release.py} ${lib.escapeShellArg xpiSource} ${../extension}
    cp ${lib.escapeShellArg xpiSource} "$out"
  '';
  hostProgram = pkgs.writeShellScript "wrees-startpage-native" ''
    exec ${pkgs.python3}/bin/python3 -I -B ${../native/host.py} ${lib.escapeShellArg cfg.noctalia.paletteFile} "$@"
  '';
  hostManifest = pkgs.writeText "${hostName}.json" (builtins.toJSON {
    name = hostName;
    description = "Read validated Noctalia start-page colors";
    path = toString hostProgram;
    type = "stdio";
    allowed_extensions = [ extensionId ];
  });
  nativeHost = pkgs.runCommand "wrees-startpage-native-host" { } ''
    mkdir -p "$out/lib/mozilla/native-messaging-hosts"
    cp ${hostManifest} "$out/lib/mozilla/native-messaging-hosts/${hostName}.json"
  '';
  browserConfig = {
  policies = {
    ExtensionSettings.${extensionId} = {
      installation_mode = "normal_installed";
      install_url = "file://${checkedXpi}";
      updates_disabled = true;
      private_browsing = false;
    };
    "3rdparty".Extensions.${extensionId} = {
      inherit (cfg) username hostname;
      noctalia = cfg.noctalia.enable;
    } // lib.optionalAttrs (cfg.categories != null) {
      inherit (cfg) categories;
    };
  };
  profiles.${cfg.profile}.settings."browser.startup.page" = 1;
  nativeMessagingHosts = lib.optional cfg.noctalia.enable nativeHost;
  };
in
{
  options.programs.wrees-startpage = {
    enable = lib.mkEnableOption "Wrees Startpage";
    browser = lib.mkOption {
      type = lib.types.enum [ "zen-browser" "firefox" ];
      default = "zen-browser";
    };
    profile = lib.mkOption {
      type = lib.types.str;
      default = "default";
    };
    xpi = lib.mkOption {
      type = lib.types.either lib.types.path lib.types.package;
      description = "Mozilla-signed XPI matching this module's pinned extension source.";
    };
    username = lib.mkOption {
      type = lib.types.str;
      default = config.home.username;
    };
    hostname = lib.mkOption {
      type = lib.types.str;
      default = "localhost";
    };
    categories = lib.mkOption {
      type = lib.types.nullOr (lib.types.listOf (lib.types.submodule {
        options = {
          title = lib.mkOption { type = lib.types.str; };
          links = lib.mkOption {
            type = lib.types.listOf (lib.types.submodule {
              options = {
                title = lib.mkOption { type = lib.types.str; };
                url = lib.mkOption { type = lib.types.str; };
              };
            });
          };
        };
      }));
      default = null;
    };
    noctalia = {
      enable = lib.mkEnableOption "local Noctalia palette integration";
      paletteFile = lib.mkOption {
        type = lib.types.str;
        default = "${config.xdg.configHome}/noctalia/colors.json";
      };
    };
  };

  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = cfg.browser != "zen-browser" || options.programs ? zen-browser;
        message = "Import the Zen Home Manager module or select browser = firefox for Wrees Startpage.";
      }
      {
        assertion = lib.hasPrefix "/" cfg.noctalia.paletteFile;
        message = "Wrees Startpage requires an absolute Noctalia palette file path.";
      }
    ];
    programs = lib.mkMerge (
      [ (lib.mkIf (cfg.browser == "firefox") { firefox = browserConfig; }) ]
      ++ lib.optional (options.programs ? zen-browser)
        (lib.mkIf (cfg.browser == "zen-browser") { zen-browser = browserConfig; })
    );
  };
}
