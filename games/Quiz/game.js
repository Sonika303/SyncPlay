import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, update } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig={
apiKey:"AIzaSyCODp3h025sM3jl7Ji0GJgVuGoWCD1wddU",
authDomain:"syncplay-17b6e.firebaseapp.com",
databaseURL:"https://syncplay-17b6e-default-rtdb.firebaseio.com",
projectId:"syncplay-17b6e"
};

const app=initializeApp(firebaseConfig);
const db=getDatabase(app);

const code=localStorage.getItem("party");
const gameArea=document.getElementById("gameArea");

const questions=[
{q:"Capital of Italy?",a:["Rome","Paris","Berlin","Madrid"],c:0},
{q:"3+5?",a:["6","7","8","9"],c:2}
];

let current=0;

gameArea.innerHTML=`
<h2 id="question"></h2>
<button id="startBtn">Start Quiz</button>
<button id="nextBtn" style="display:none">Next Question</button>
`;

document.getElementById("startBtn").onclick=start;

document.getElementById("nextBtn").onclick=()=>{
current++;
if(current>=questions.length){
alert("Game Finished");
return;
}
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
