#!/usr/bin/env bash
cd "D:/websites/wardrope/frontend"
BID=29b6f802-517e-4320-b35a-2ff701a49102
LOG=watch-build.log
echo "=== watcher started $(date) for build $BID ===" | tee -a $LOG
for i in $(seq 1 72); do
  STATUS=$(npx eas build:view $BID --json --non-interactive 2>/dev/null | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d).status)}catch{console.log("UNKNOWN")}})')
  echo "[poll $i] status=$STATUS $(date)" | tee -a $LOG
  if [ "$STATUS" = "FINISHED" ] || [ "$STATUS" = "ERRORED" ] || [ "$STATUS" = "CANCELED" ]; then
    echo ">>> BUILD $STATUS — stopping watcher" | tee -a $LOG
    break
  fi
  sleep 300
done
echo "=== watcher exit $(date) ===" | tee -a $LOG
