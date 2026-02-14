import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, update }
from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig={
apiKey:"AIzaSyCODp3h025sM3jl7Ji0GJgVuGoWCD1wddU",
authDomain:"syncplay-17b6e.firebaseapp.com",
databaseURL:"https://syncplay-17b6e-default-rtdb.firebaseio.com",
projectId:"syncplay-17b6e"
};

const app=initializeApp(firebaseConfig);
const db=getDatabase(app);

const code=localStorage.getItem("party");

const questions=[
{q:"Capital of Italy?",c:0},
{q:"3+5?",c:2}
];

let current=0;

document.body.innerHTML=`
<h2 id="question"></h2>
<button id="nextBtn">Next Question</button>
`;

show();

document.getElementById("nextBtn").onclick=()=>{
current++;
if(current>=questions.length){
alert("Game Finished");
return;
}
show();
};

function show(){
document.getElementById("question").textContent=questions[current].q;

update(ref(db,"parties/"+code),{
gameState:"question",
currentQuestion:current,
answered:false
});
}
