import { PROMPTS, CHALLENGES, POSITION_CATEGORIES, POSITION_REFERENCE_URL } from "./data.js";
import { isSupabaseConfigured, createRoom, joinRoom, getSavedRoom, startRoomPolling, clearRoom, updateRoomState } from "./online-room.js";

const $ = (id) => document.getElementById(id);
const screens = ["entrance","lobby","gameScreen","onlineRoom"];
let mode = "together";
let currentGame = "";
let category = "cute";
let currentPrompt = "";
let storyLines = [];
let storyTurn = 1;
let audioContext = null;
let musicOn = false;
let latestRoomData = null;
let lastSharedCardKey = "";

function showScreen(id){
  screens.forEach(screen => $(screen).classList.toggle("is-hidden",screen!==id));
  window.scrollTo({top:0,behavior:"instant"});
}
function updateModeGames(){
  const storyTile=document.querySelector('[data-game="story"]');
  if(storyTile) storyTile.classList.toggle("is-hidden",mode!=="online");
  const boardTile=document.querySelector('[data-game="board"]');
  if(boardTile) boardTile.classList.toggle("is-hidden",mode!=="together");
}
function randomItem(list){
  if(!Array.isArray(list)||!list.length) return "No cards available in this category yet.";
  return list[Math.floor(Math.random()*list.length)];
}
function setMusic(on){
  musicOn=on;
  $("soundToggle").setAttribute("aria-pressed",String(on));
  $("soundToggle").innerHTML=on?"♫ <span>SOUND ON</span>":"♫ <span>SOUND OFF</span>";
  if(!on){ if(audioContext){audioContext.close();audioContext=null;} return; }
  try{
    audioContext=new (window.AudioContext||window.webkitAudioContext)();
    const master=audioContext.createGain();master.gain.value=.035;master.connect(audioContext.destination);
    const notes=[110,164.81,220,164.81];
    notes.forEach((hz,i)=>{
      const osc=audioContext.createOscillator(),gain=audioContext.createGain();
      osc.type="sine";osc.frequency.value=hz;gain.gain.value=.16;
      osc.connect(gain);gain.connect(master);osc.start();
      gain.gain.setTargetAtTime(.05,audioContext.currentTime+i*.12,1.5);
    });
  }catch(e){console.warn("Audio unavailable",e);}
}
$("soundToggle").addEventListener("click",()=>setMusic(!musicOn));

document.querySelectorAll("[data-mode]").forEach(button=>{
  button.addEventListener("click",()=>{
    mode=button.dataset.mode;
    updateModeGames();
    if(mode==="online"){
      showScreen("onlineRoom");
      $("roomStatus").classList.add("is-hidden");
      $("modeLabel").textContent="ONLINE / TWO SCREENS";
      const saved=getSavedRoom();
      if(saved) showActiveRoom();
    }else{
      $("modeLabel").textContent="TOGETHER / ONE SCREEN · TWO PLAYERS";
      showScreen("lobby");
    }
    $("gameModeLabel").textContent=mode==="together"?"TOGETHER / ONE SCREEN":"ONLINE / TWO SCREENS";
  });
});

function roomMessage(message, error=false){
  const box=$("roomStatus");
  box.classList.remove("is-hidden");
  if(getSavedRoom() && box.querySelector(".room-code")){
    let notice=document.getElementById("roomNotice");
    if(!notice){notice=document.createElement("p");notice.id="roomNotice";box.append(notice);}
    notice.className=error?"room-error":"";
    notice.textContent=message;
  }else{
    box.innerHTML=`<p class="${error?"room-error":""}">${escapeHtml(message)}</p>`;
  }
}
function showActiveRoom(){
  const saved=getSavedRoom();
  if(!saved)return;
  const box=$("roomStatus");
  box.classList.remove("is-hidden");
  box.innerHTML=`<span class="eyebrow">YOUR PRIVATE ROOM · PLAYER ${saved.player}</span>
    <div class="room-code">${escapeHtml(saved.code)}</div>
    <p id="roomWaitingText">Checking room…</p>
    <div class="room-actions">
      <button id="copyRoomCode" type="button">COPY ROOM CODE</button>
      <button id="enterOnlineGames" type="button" class="is-hidden">ENTER GAMES ↗</button>
      <button id="leaveRoom" type="button">LEAVE ROOM</button>
    </div>`;
  $("copyRoomCode").onclick=async()=>{
    try{await navigator.clipboard.writeText(saved.code);roomMessage("Room code copied. Send it to your player.");}
    catch{roomMessage(`Your room code is ${saved.code}. Copy it manually.`);}
  };
  $("enterOnlineGames").onclick=async()=>{
    mode="online";
    updateModeGames();
    $("modeLabel").textContent="ONLINE / TWO SCREENS";
    $("gameModeLabel").textContent="ONLINE / TWO SCREENS";
    showScreen("lobby");
    try {
      await publishSharedState({screen:"lobby",game:null,updated_at:new Date().toISOString()});
    } catch(error) {
      roomMessage(error.message||"Could not sync the lobby.",true);
    }
  };
  $("leaveRoom").onclick=()=>{
    clearRoom();
    latestRoomData=null;
    box.classList.add("is-hidden");
    roomMessage("You left the room.");
  };
  startRoomPolling(data=>{
    latestRoomData=data;
    const label=$("roomWaitingText");
    const enter=$("enterOnlineGames");
    if(label) label.textContent=data.player_count===2?"Both players are here. Room ready.":"Waiting for the other player to join…";
    if(enter) enter.classList.toggle("is-hidden",data.player_count!==2);
    syncOnlineNavigation(data);
    syncOnlineTruthDare(data);
    syncOnlineStory(data);
    syncOnlineRoulette(data);
  },error=>{
    const label=$("roomWaitingText");
    if(label)label.textContent=error.message||"Connection interrupted. Retrying…";
  });
}
$("roomBack").addEventListener("click",()=>{clearRoom();showScreen("entrance");});
$("createRoom").addEventListener("click",async()=>{
  if(!isSupabaseConfigured()){roomMessage("Supabase connection details are not added yet. We'll add your Project URL and publishable key next.",true);return;}
  $("createRoom").disabled=true;
  try{await createRoom();showActiveRoom();}
  catch(error){roomMessage(error.message||"Could not create room.",true);}
  finally{$("createRoom").disabled=false;}
});
$("joinRoom").addEventListener("click",async()=>{
  if(!isSupabaseConfigured()){roomMessage("Supabase connection details are not added yet. We'll add your Project URL and publishable key next.",true);return;}
  const code=$("roomCodeInput").value.trim();
  if(code.length!==6){roomMessage("Enter the complete six-character room code.",true);return;}
  $("joinRoom").disabled=true;
  try{await joinRoom(code);showActiveRoom();}
  catch(error){roomMessage(error.message||"Could not join room.",true);}
  finally{$("joinRoom").disabled=false;}
});
$("roomCodeInput").addEventListener("input",e=>{e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"");});

$("backToEntrance").addEventListener("click",()=>{
  if(mode==="online" && getSavedRoom()) {
    showScreen("onlineRoom");
    return;
  }
  showScreen("entrance");
});
$("backToLobby").addEventListener("click",async()=>{
  if(mode==="online") {
    try {
      await publishSharedState({screen:"lobby",game:null,updated_at:new Date().toISOString()});
    } catch(error) {
      roomMessage(error.message||"Could not return both players to the lobby.",true);
    }
  }
  currentGame="";
  showScreen("lobby");
});

document.querySelectorAll("[data-game]").forEach(button=>{
  button.addEventListener("click",()=>{
    const game=button.dataset.game;
    if(game==="board" && mode!=="together") return;
    openGame(game);
  });
});

async function publishSharedState(patch){
  const previous=latestRoomData?.room_state||{};
  const next={...previous,...patch,updated_at:patch.updated_at||new Date().toISOString()};
  await updateRoomState(next);
  if(latestRoomData) latestRoomData={...latestRoomData,room_state:next};
  return next;
}

function syncOnlineNavigation(data){
  if(mode!=="online" || !data?.room_state) return;
  const state=data.room_state;
  if(state.screen==="lobby"){
    if(currentGame!=="" || $("lobby").classList.contains("is-hidden")){
      currentGame="";
      showScreen("lobby");
    }
    return;
  }
  if(state.screen==="game" && state.game){
    if(currentGame!==state.game || $("gameScreen").classList.contains("is-hidden")){
      openGame(state.game,{broadcast:false,sharedState:state});
    }
  }
}

function openGame(game, options={}){
  const {broadcast=true,sharedState=null}=options;
  if(mode==="online" && !getSavedRoom()){
    showScreen("onlineRoom");
    roomMessage("Create or join a room before starting an online game.",true);
    return;
  }
  currentGame=game;
  $("gameModeLabel").textContent=mode==="together"?"TOGETHER / ONE SCREEN":"ONLINE / TWO SCREENS";
  $("gameControls").replaceChildren();
  $("gameActions").replaceChildren();
  $("gameStage").replaceChildren();
  const names={truthdare:"TRUTH OR DARE",story:"SPICE STORIES",roulette:"POSITION ROULETTE",board:"BOARD GAMES"};
  $("gameTitle").textContent=names[game]||"AFTERHOURS";
  $("gameSubtitle").textContent=game==="truthdare"?"Choose a card. Let fate decide.":"Your night, your rules.";

  if(mode==="online" && sharedState) latestRoomData={...latestRoomData,room_state:sharedState};
  if(mode==="online" && broadcast){
    const now=new Date().toISOString();
    const initial={
      truthdare:{screen:"game",game:"truthdare",view:"deck",category,updated_at:now},
      story:{screen:"game",game:"story",lines:[],turn:1,ended:false,updated_at:now},
      roulette:{screen:"game",game:"roulette",group:null,position:null,updated_at:now}
    }[game];
    if(initial) latestRoomData={...latestRoomData,room_state:initial};
  }

  if(game==="truthdare") setupTruthDare();
  if(game==="story") setupStory();
  if(game==="roulette") setupRoulette();
  if(game==="board") setupBoard();
  showScreen("gameScreen");

  if(mode==="online" && broadcast){
    const initial=latestRoomData?.room_state;
    if(initial?.game===game) publishSharedState(initial).catch(error=>roomMessage(error.message||"Could not sync the selected game.",true));
  }
}

function setupCategory(){
  const select=document.createElement("select");
  [["cute","CUTE"],["flirty","FLIRTY"],["bold","BOLD"],["adults","ADULTS-ONLY"]].forEach(([value,label])=>{
    const option=document.createElement("option");option.value=value;option.textContent=label;select.append(option);
  });
  select.value=category;
  select.addEventListener("change",async()=>{
    category=select.value;
    if(mode==="online"){
      latestRoomData={...latestRoomData,room_state:{...latestRoomData?.room_state,screen:"game",game:"truthdare",view:"deck",category,updated_at:new Date().toISOString()}};
    }
    lastSharedCardKey="";
    setupTruthDare();
    if(mode==="online"){
      try{
        await publishSharedState({screen:"game",game:"truthdare",view:"deck",category,updated_at:new Date().toISOString()});
      }catch(error){roomMessage(error.message||"Could not sync the card category.",true);}
    }
  });
  $("gameControls").append(select);
}
function setupTruthDare(){
  $("gameTitle").textContent="TRUTH OR DARE";
  $("gameControls").replaceChildren();setupCategory();
  $("gameStage").innerHTML=`<div class="deck-fan" aria-label="Choose a card from the deck">${Array.from({length:11},(_,i)=>`<button class="fan-card" type="button" aria-label="Draw card ${i+1}" style="--i:${i};--angle:${(i-5)*7}deg"><span class="card-back"><span class="card-monogram">AH</span></span></button>`).join("")}</div>`;
  $("gameStage").querySelectorAll(".fan-card").forEach(card=>card.addEventListener("click",()=>drawTruthDare()));
  $("gameActions").innerHTML=`<button type="button" id="drawAgain">SHUFFLE & DRAW AGAIN ↗</button>`;
  $("drawAgain").addEventListener("click",drawTruthDare);
  $("gameSubtitle").textContent="Pick any card from the fan. It could be a Truth or a Dare.";
  if(mode==="online" && latestRoomData?.room_state?.game==="truthdare"){
    const shared=latestRoomData.room_state;
    if(shared.view==="card") renderTruthDareCard(shared);
  }
}
function renderTruthDareCard(card){
  if(!card || card.game!=="truthdare" || card.view!=="card") return;
  const key=[card.updated_at||"",card.kind,card.category,card.prompt].join("|");
  if(key===lastSharedCardKey && $("gameTitle").textContent===card.kind) return;
  lastSharedCardKey=key;
  category=card.category||category;
  currentPrompt=card.prompt||"";
  $("gameTitle").textContent=card.kind||"TRUTH";
  $("gameSubtitle").textContent=`${(card.category||"cute").toUpperCase()} · ${card.kind==="TRUTH"?"THE QUESTION":"THE CHALLENGE"}`;
  $("gameStage").innerHTML=`<div class="drawn-wrap"><article class="drawn-card"><div class="drawn-art"></div><div class="drawn-shade"></div><div class="drawn-frame"><span class="drawn-label">AFTERHOURS · ${card.kind==="TRUTH"?"TRUTH":"DARE"}</span><span class="drawn-symbol">${card.kind==="TRUTH"?"♢":"✦"}</span><p class="drawn-prompt"></p><span class="drawn-footer">ONE DRAW. ONE MOMENT.</span></div></article></div>`;
  $("gameStage").querySelector(".drawn-prompt").textContent=currentPrompt;
  requestAnimationFrame(()=>$("gameStage").querySelector(".drawn-card")?.classList.add("revealed"));
  $("gameActions").innerHTML=`<button type="button" id="anotherCard">DRAW ANOTHER CARD ↗</button><button type="button" id="backToDeck">BACK TO DECK</button>`;
  $("anotherCard").addEventListener("click",drawTruthDare);
  $("backToDeck").addEventListener("click",async()=>{
    if(mode==="online"){
      try{
        await publishSharedState({screen:"game",game:"truthdare",view:"deck",category,updated_at:new Date().toISOString()});
        lastSharedCardKey="";
      }catch(error){roomMessage(error.message||"Could not update the shared deck.",true);}
    }
    setupTruthDare();
  });
}
async function drawTruthDare(){
  const isTruth=Math.random()<.5;
  const deck=isTruth?PROMPTS[category]:CHALLENGES[category];
  currentPrompt=randomItem(deck);
  const card={screen:"game",game:"truthdare",view:"card",kind:isTruth?"TRUTH":"DARE",category,prompt:currentPrompt,updated_at:new Date().toISOString()};
  if(mode==="online"){
    try{
      await publishSharedState(card);
      lastSharedCardKey="";
      renderTruthDareCard(card);
    }catch(error){
      roomMessage(error.message||"Could not share this card with the other player.",true);
    }
  }else{
    renderTruthDareCard(card);
  }
}
function syncOnlineTruthDare(data){
  if(mode!=="online" || currentGame!=="truthdare" || !data?.room_state) return;
  const state=data.room_state;
  if(state.game!=="truthdare") return;
  if(state.category && state.category!==category){
    category=state.category;
    lastSharedCardKey="";
    setupTruthDare();
  }
  if(state.view==="card") renderTruthDareCard(state);
  else if(state.view==="deck" && $("gameTitle").textContent!=="TRUTH OR DARE"){
    lastSharedCardKey="";
    setupTruthDare();
  }
}
function setupStory(){
  $("gameSubtitle").textContent="Take turns adding one line to a shared story.";
  if(mode==="online"){
    const state=latestRoomData?.room_state;
    if(state?.game==="story"){renderStoryShared(state);return;}
    renderStoryShared({game:"story",lines:[],turn:1,ended:false});
    return;
  }
  storyLines=[];storyTurn=1;renderStory();
}
function renderStory(){
  $("gameStage").innerHTML=`<div class="simple-panel"><span class="eyebrow">PLAYER ${storyTurn}'S TURN</span><h3>Continue the story…</h3><div id="storyOutput"></div><textarea id="storyInput" placeholder="Write your next line…"></textarea><div class="game-actions"><button id="addStoryLine" type="button">ADD YOUR LINE</button><button id="tapOut" type="button">END STORY</button></div></div>`;
  $("storyOutput").innerHTML=storyLines.map((line,i)=>`<p><small>PLAYER ${(i%2)+1}</small><br>${escapeHtml(line)}</p>`).join("");
  $("addStoryLine").addEventListener("click",()=>{
    const line=$("storyInput").value.trim();if(!line)return;
    storyLines.push(line);storyTurn=storyTurn===1?2:1;renderStory();
  });
  $("tapOut").addEventListener("click",()=>{$("gameStage").innerHTML=`<div class="simple-panel"><h3>The story ends here.</h3><p>${storyLines.length} lines written together.</p></div>`;$("gameActions").innerHTML=`<button id="restartStory" type="button">START ANOTHER STORY</button>`;$("restartStory").onclick=setupStory;});
}
let lastStoryVersion="";
function renderStoryShared(state){
  const saved=getSavedRoom();
  const player=saved?.player||1;
  const lines=Array.isArray(state.lines)?state.lines:[];
  const turn=state.turn===2?2:1;
  const ended=!!state.ended;
  const version=JSON.stringify([lines,turn,ended]);
  if(version===lastStoryVersion && $("storySharedPanel"))return;
  lastStoryVersion=version;
  $("gameStage").innerHTML=`<div class="simple-panel" id="storySharedPanel"><span class="eyebrow">${ended?"STORY COMPLETE":`PLAYER ${turn}'S TURN`}</span><h3>${ended?"The story ends here.":"Continue the story…"}</h3><div id="storyOutput"></div>${ended?"":`<textarea id="storyInput" placeholder="${player===turn?"Write your next line…":"Waiting for your partner…"}" ${player===turn?"":"disabled"} maxlength="1000"></textarea>`}<div class="game-actions">${ended?'<button id="restartStory" type="button">START ANOTHER STORY</button>':`<button id="addStoryLine" type="button" ${player===turn?"":"disabled"}>ADD YOUR LINE</button><button id="tapOut" type="button">END STORY</button>`}</div></div>`;
  $("storyOutput").innerHTML=lines.map((line,i)=>`<p><small>PLAYER ${(i%2)+1}</small><br>${escapeHtml(String(line))}</p>`).join("");
  const send=async(next)=>{
    try{await publishSharedState({...next,screen:"game",game:"story"});lastStoryVersion="";renderStoryShared(next);}
    catch(error){alert(error.message||"Could not save story. Please try again.");}
  };
  if(ended){$("restartStory").onclick=()=>send({game:"story",lines:[],turn:1,ended:false});}
  else{
    $("addStoryLine").onclick=()=>{
      if(player!==turn)return;
      const line=$("storyInput").value.trim();if(!line)return;
      send({game:"story",lines:[...lines,line],turn:turn===1?2:1,ended:false});
    };
    $("tapOut").onclick=()=>send({game:"story",lines,turn,ended:true});
  }
}
function syncOnlineStory(data){
  if(mode!=="online"||currentGame!=="story"||!data?.room_state||data.room_state.game!=="story")return;
  renderStoryShared(data.room_state);
}
function escapeHtml(value){return value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));}

function setupRoulette(){
  $("gameSubtitle").textContent="Spin a category and reveal a random position.";
  const options=Object.keys(POSITION_CATEGORIES);
  $("gameControls").innerHTML=`<select id="positionCategory"><option value="random">RANDOM CATEGORY</option>${options.map(name=>`<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}</select>`;
  $("gameStage").innerHTML=`<div class="simple-panel"><span class="eyebrow">CHANCE & FATE</span><h3>Ready to spin?</h3><p>Let the wheel choose your next card.</p></div>`;
  $("gameActions").innerHTML=`<button id="spinPosition" type="button">SPIN THE ROULETTE ↻</button><a class="reference-button" href="${POSITION_REFERENCE_URL}" target="_blank" rel="noopener">POSITION REFERENCE ↗</a>`;
  $("spinPosition").addEventListener("click",async()=>{
    const chosen=$("positionCategory").value;
    const group=chosen==="random"?randomItem(options):chosen;
    const position=randomItem(POSITION_CATEGORIES[group]);
    const next={screen:"game",game:"roulette",group,position,updated_at:new Date().toISOString()};
    if(mode==="online"){
      try{await publishSharedState(next);}catch(error){alert(error.message||"Unable to share the result.");return;}
    }
    renderRouletteShared(next);
  });
  if(mode==="online"&&latestRoomData?.room_state?.game==="roulette")renderRouletteShared(latestRoomData.room_state);
}
let lastRouletteVersion="";
function renderRouletteShared(state){
  const version=JSON.stringify([state.group,state.position,state.updated_at]);
  if(version===lastRouletteVersion && $("gameStage").querySelector(".roulette-result"))return;
  lastRouletteVersion=version;
  $("gameStage").innerHTML=`<div class="simple-panel roulette-result"><span class="eyebrow">${escapeHtml(String(state.group||"CHANCE & FATE"))}</span><h3>${escapeHtml(String(state.position||"Ready to spin?"))}</h3><p>Your next draw is ready.</p></div>`;
}
function syncOnlineRoulette(data){
  if(mode!=="online"||currentGame!=="roulette"||!data?.room_state||data.room_state.game!=="roulette")return;
  renderRouletteShared(data.room_state);
}
let boardPlayers=[1,1];
let boardTurn=0;
let boardBusy=false;
function boardCell(position){
  const rowFromBottom=Math.floor((position-1)/7);
  const offset=(position-1)%7;
  const col=rowFromBottom%2===0?offset:6-offset;
  const row=6-rowFromBottom;
  return {row:row+1,col:col+1};
}
function setupBoard(){
  boardPlayers=[1,1];boardTurn=0;boardBusy=false;
  $("gameSubtitle").textContent="Roll the dice, move along the numbered path, and follow the instruction on the square you land on.";
  renderBoard();
}
function renderBoard(){
  const p1=boardCell(boardPlayers[0]),p2=boardCell(boardPlayers[1]);
  $("gameStage").innerHTML=`<div class="board-game-layout">
    <div class="board-meta"><span class="eyebrow">THE COUPLES GAME · 49 SPACES</span><span class="board-turn">PLAYER ${boardTurn+1}'S TURN</span></div>
    <div class="board-wrap">
      <img class="board-image" src="./assets/couples-board-game.jpg" alt="Couples board game with 49 numbered spaces from Start to Finish">
      <div class="board-token-layer">
        <span class="board-token token-one" style="--row:${p1.row};--col:${p1.col}" aria-label="Female player position ${boardPlayers[0]}">♀</span>
        <span class="board-token token-two" style="--row:${p2.row};--col:${p2.col}" aria-label="Male player position ${boardPlayers[1]}">♂</span>
      </div>
    </div>
    <div class="board-status">
      <div><span class="player-dot one"></span><strong>PLAYER 1</strong><small>SPACE ${boardPlayers[0]}</small></div>
      <div class="dice-result-wrap"><div class="dice-stage" aria-label="3D dice"><div class="dice-cube" id="diceCube"><span class="dice-face face-front">⚄</span><span class="dice-face face-back">⚁</span><span class="dice-face face-right">⚂</span><span class="dice-face face-left">⚃</span><span class="dice-face face-top">⚅</span><span class="dice-face face-bottom">⚀</span></div></div><small id="diceValue">ROLL</small></div>
      <div><span class="player-dot two"></span><strong>PLAYER 2</strong><small>SPACE ${boardPlayers[1]}</small></div>
    </div>
  </div>`;
  $("gameActions").innerHTML=`<button id="rollBoardDice" type="button">ROLL THE DICE ⚄</button><button id="resetBoard" type="button">RESET GAME</button>`;
  $("rollBoardDice").disabled=boardBusy;
  $("rollBoardDice").addEventListener("click",rollBoardDice);
  $("resetBoard").addEventListener("click",setupBoard);
}
function rollBoardDice(){
  if(boardBusy)return;
  boardBusy=true;
  const roll=1+Math.floor(Math.random()*6);
  const player=boardTurn;
  const current=boardPlayers[player];
  const target=current+roll;
  $("rollBoardDice").disabled=true;
  const dice=$("diceCube");
  dice.classList.remove("rolling");
  void dice.offsetWidth;
  dice.classList.add("rolling");
  let spins=0;
  const tumble=setInterval(()=>{
    spins++;
    if(spins>9){
      clearInterval(tumble);
      dice.classList.remove("rolling");
      dice.style.setProperty("--final-face",String(roll));
      if(target<=49){
        boardPlayers[player]=target;
        renderBoard();
        $("diceValue").textContent=`ROLLED ${roll}`;
        if(target===49){
          $("gameSubtitle").textContent=`PLAYER ${player+1} reached FINISH! You won the board game.`;
          $("gameActions").innerHTML=`<button id="playAgain" type="button">PLAY AGAIN</button>`;
          $("playAgain").onclick=setupBoard;
          boardBusy=false;
          return;
        }
        $("gameSubtitle").textContent=`PLAYER ${player+1} rolled ${roll} and landed on space ${target}. Read the instruction on that square.`;
      }else{
        $("diceValue").textContent=`ROLLED ${roll}`;
        $("gameSubtitle").textContent=`PLAYER ${player+1} rolled ${roll}. You need an exact roll to reach FINISH — stay on space ${current}.`;
      }
      boardTurn=boardTurn===0?1:0;
      boardBusy=false;
      const turnLabel=document.querySelector(".board-turn");
      if(turnLabel)turnLabel.textContent=`PLAYER ${boardTurn+1}'S TURN`;
      const rollButton=$("rollBoardDice");
      if(rollButton)rollButton.disabled=false;
    }
  },75);
}
