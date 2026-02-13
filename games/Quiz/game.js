import { getDatabase, ref, update } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-database.js";

const db=getDatabase();
const code=localStorage.getItem("party");
const gameArea=document.getElementById("gameArea");

const questions=[
{q:"Capital of Italy?",a:["Rome","Paris","Berlin","Madrid"],c:0},
{q:"3+5?",a:["6","7","8","9"],c:2}
];

let current=0;

gameArea.innerHTML=`
<div class="panel">
<h3 id="question"></h3>
<button id="startBtn">Start Quiz</button>
<button id="nextBtn" style="display:none">Next</button>
</div>
`;

document.getElementById("startBtn").onclick=start;

document.getElementById("nextBtn").onclick=()=>{
  current++;
  if(current>=questions.length){alert("Game Finished");return;}
  show();
};

function start(){
  document.getElementById("startBtn").style.display="none";
  document.getElementById("nextBtn").style.display="inline-block";
  show();
}

function show(){
  const q=questions[current];
  document.getElementById("question").textContent=q.q;

  update(ref(db,"parties/"+code),{
    gameState:"question",
    currentQuestion:current,
    correct:q.c,
    answered:false
  });
}
