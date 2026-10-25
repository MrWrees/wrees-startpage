{ runCommand, python3 }:
runCommand "wrees-startpage-1.0.0-unsigned" {
  nativeBuildInputs = [ python3 ];
  passthru.extensionId = "startpage@wrees";
} ''
  mkdir -p "$out/share/mozilla/extensions"
  python3 -I -B ${../scripts/build.py} --source ${../extension} --output "$out/share/mozilla/extensions/startpage@wrees.xpi"
''
