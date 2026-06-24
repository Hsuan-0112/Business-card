import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

/* 到 Firebase 專案設定複製 config 後，貼到這裡 */
const firebaseConfig = {
  apiKey: "AIzaSyBa0cU92Zw_r6VScI11azqR5OymqmWuHRw",
  authDomain: "business-card-ed16e.firebaseapp.com",
  projectId: "business-card-ed16e",
  storageBucket: "business-card-ed16e.firebasestorage.app",
  messagingSenderId: "343681889137",
  appId: "1:343681889137:web:4e0bf39f76def3db8d3cd0"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const contactsRef = collection(db, "contacts");

let contacts = [];
let currentUser = null;
const $ = id => document.getElementById(id);

$("loginBtn").onclick = () => signInWithPopup(auth, provider);
$("logoutBtn").onclick = () => signOut(auth);
$("searchInput").addEventListener("input", renderContacts);
$("clearBtn").onclick = clearForm;

onAuthStateChanged(auth, user => {
  currentUser = user;
  if (user) {
    $("loginBtn").classList.add("hidden");
    $("logoutBtn").classList.remove("hidden");
    $("userInfo").textContent = user.email || "已登入";
    $("mobileEditor").classList.remove("hidden");
    startListening();
  } else {
    $("loginBtn").classList.remove("hidden");
    $("logoutBtn").classList.add("hidden");
    $("userInfo").textContent = "";
    $("mobileEditor").classList.add("hidden");
    $("contactList").innerHTML = "<p>請先登入。</p>";
  }
});

function isMobile(){ return window.innerWidth <= 767; }

function startListening(){
  const q = query(contactsRef, orderBy("updatedAt", "desc"));
  onSnapshot(q, snap => {
    contacts = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    renderContacts();
  });
}

function renderContacts(){
  const kw = $("searchInput").value.trim().toLowerCase();
  const list = contacts.filter(c => [
    c.name,c.company,c.title,c.phone,c.email,c.address,c.website,c.lineId,c.category,c.tags,c.note
  ].join(" ").toLowerCase().includes(kw));

  if (!currentUser) { $("contactList").innerHTML = "<p>請先登入。</p>"; return; }
  if (!list.length) { $("contactList").innerHTML = "<p>目前沒有資料。</p>"; return; }

  $("contactList").innerHTML = list.map(c => `
    <div class="card">
      <h3>${esc(c.name || "未命名")}</h3>
      <p class="small">${esc(c.company || "")}｜${esc(c.title || "")}</p>
      <p>電話：${esc(c.phone || "")}</p>
      <p>Email：${esc(c.email || "")}</p>
      <p>地址：${esc(c.address || "")}</p>
      <p>分類：${esc(c.category || "")}</p>
      <p>標籤：${esc(c.tags || "")}</p>
      <p>備註：${esc(c.note || "")}</p>
      ${isMobile()?`<div class="actions"><button onclick="window.editContact('${c.id}')">編輯</button><button class="danger" onclick="window.deleteContact('${c.id}')">刪除</button></div>`:""}
    </div>`).join("");
}

window.editContact = id => {
  const c = contacts.find(x=>x.id===id); if(!c) return;
  $("editingId").value = id;
  ["name","company","title","phone","email","address","website","category","tags","note"].forEach(k => $(k).value = c[k] || "");
  $("lineId").value = c.lineId || "";
  $("formTitle").textContent = "編輯名片";
  scrollTo({top:0, behavior:"smooth"});
};

window.deleteContact = async id => {
  if (confirm("確定刪除這筆名片嗎？")) await deleteDoc(doc(db,"contacts",id));
};

$("cardForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!currentUser) return alert("請先登入");
  const data = {
    name:$("name").value.trim(), company:$("company").value.trim(), title:$("title").value.trim(),
    phone:$("phone").value.trim(), email:$("email").value.trim(), address:$("address").value.trim(),
    website:$("website").value.trim(), lineId:$("lineId").value.trim(), category:$("category").value.trim(),
    tags:$("tags").value.trim(), note:$("note").value.trim(),
    updatedAt:serverTimestamp(), updatedBy:currentUser.email || ""
  };
  if ($("editingId").value) {
    await updateDoc(doc(db,"contacts",$("editingId").value), data);
    alert("已更新");
  } else {
    data.createdAt = serverTimestamp();
    data.createdBy = currentUser.email || "";
    await addDoc(contactsRef, data);
    alert("已新增");
  }
  clearForm();
});

$("ocrBtn").onclick = async () => {
  const file = $("imageInput").files[0];
  if (!file) return alert("請先選擇圖片");
  $("ocrStatus").textContent = "OCR辨識中...";
  try {
    const result = await Tesseract.recognize(file, "chi_tra+eng", {
      logger:m => { if(m.status==="recognizing text") $("ocrStatus").textContent = `OCR辨識中 ${Math.round(m.progress*100)}%`; }
    });
    $("ocrText").value = result.data.text || "";
    $("ocrStatus").textContent = "OCR完成，請按整理欄位";
  } catch(e) {
    $("ocrStatus").textContent = "OCR失敗，請改用手機內建文字辨識後貼上。";
  }
};

$("parseBtn").onclick = () => fillForm(parseCardText($("ocrText").value));

function parseCardText(text){
  const lines = (text||"").split(/\n+/).map(x=>x.trim()).filter(Boolean);
  const email = match(text, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  const phone = match(text, /(\+?\d[\d\s\-()]{7,}\d)/);
  const website = match(text, /(https?:\/\/[^\s]+|www\.[^\s]+)/i);
  let lineId = ""; const lm = text.match(/(LINE|Line|line)[:：\s]*([A-Za-z0-9_.-]+)/); if(lm) lineId=lm[2];

  let name = lines[0] || "", company="", title="", address="";
  const companyWords=["公司","股份","有限","企業","科技","實業","商行","工作室"];
  const titleWords=["經理","主任","專員","業務","總監","負責人","設計師","工程師","執行長","顧問"];
  for(const line of lines){ if(companyWords.some(w=>line.includes(w))){ company=line; break; } }
  for(const line of lines){ if(titleWords.some(w=>line.includes(w))){ title=line; break; } }
  for(let i=lines.length-1;i>=0;i--){ if(["市","縣","區","路","街","號","樓"].some(w=>lines[i].includes(w))){ address=lines[i]; break; } }
  if(!company && lines.length>1) company=lines[1];
  if(!title && lines.length>2) title=lines[2];
  return {name,company,title,phone,email,address,website,lineId};
}

function match(text, regex){ const m=(text||"").match(regex); return m ? m[0].trim() : ""; }
function fillForm(d){ ["name","company","title","phone","email","address","website"].forEach(k=>$(k).value=d[k]||""); $("lineId").value=d.lineId||""; }
function clearForm(){ $("cardForm").reset(); $("editingId").value=""; $("ocrText").value=""; $("ocrStatus").textContent=""; $("formTitle").textContent="手機新增 / 編輯名片"; }
function esc(v){ return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }
