{ runCommand, python3 }:
let
  manifest = builtins.fromJSON (builtins.readFile ../extension/manifest.json);
in
runCommand "wrees-startpage-${manifest.version}-unsigned" {
  nativeBuildInputs = [ python3 ];
  passthru.extensionId = "startpage@wrees";
} ''
  mkdir -p "$out/share/mozilla/extensions"
  python3 -I -B ${../scripts/build.py} --source ${../extension} --output "$out/share/mozilla/extensions/startpage@wrees.xpi"
''
