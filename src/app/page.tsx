"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { GoogleAuthProvider, User, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { addDoc, collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { auth, db, initializeAnalytics } from "@/lib/firebase";

type Transaction = { id: string | number; label: string; category: string; amount: number; type: "income" | "expense"; date: string; icon: string; createdAt?: unknown };
type Message = { id: number; from: "bot" | "user"; text: string; time: string; transaction?: Transaction };

const seed: Transaction[] = [
  { id: 1, label: "Lương tháng 10", category: "Lương", amount: 15000000, type: "income", date: "Hôm nay", icon: "✦", createdAt: Date.now() },
  { id: 2, label: "Cà phê sáng", category: "Ăn uống", amount: 45000, type: "expense", date: "Hôm nay", icon: "☕", createdAt: Date.now() },
  { id: 3, label: "Grab đến công ty", category: "Di chuyển", amount: 62000, type: "expense", date: "Hôm qua", icon: "⌁", createdAt: Date.now() - 86400000 },
];
const initialMessages: Message[] = [
  { id: 1, from: "bot", text: "Chào Chi! Hôm nay mình có thể ghi thu chi và theo dõi ngân sách giúp bạn. ✦", time: "09:41" },
  { id: 2, from: "bot", text: "Bạn có thể nhắn như Telegram:\n• /ex 50k cà phê sáng\n• /in 15tr lương tháng\n• 120000 gửi xe hoặc +500k freelance\n• /td, /week, /month để xem báo cáo\n\nGõ /help để xem đầy đủ cú pháp.", time: "09:41" },
];
const vnd = (value: number) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);
const time = () => new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date());
const budgetLimits = [{ name: "Ăn uống", total: 3000000, color: "#eda867" }, { name: "Di chuyển", total: 1500000, color: "#6b91df" }, { name: "Mua sắm", total: 2000000, color: "#df6b70" }];

function toMillis(value: unknown) {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") return value.toMillis();
  return Date.now();
}

function displayDate(transaction: Transaction, referenceTime: number) {
  if (!referenceTime) return transaction.date;
  const date = new Date(toMillis(transaction.createdAt));
  const today = new Date(referenceTime);
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Hôm nay";
  if (date.toDateString() === yesterday.toDateString()) return "Hôm qua";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" }).format(date);
}

function categoryFor(description: string, type: Transaction["type"]) {
  if (type === "income") return "Thu nhập";
  const text = description.toLowerCase();
  if (/(cà phê|cafe|ăn|trưa|sáng|tối|nhà hàng|đồ ăn|trà sữa)/.test(text)) return "Ăn uống";
  if (/(grab|taxi|xe|xăng|gửi xe|bus|di chuyển)/.test(text)) return "Di chuyển";
  if (/(mua|shop|quần áo|giày|sàn thương mại)/.test(text)) return "Mua sắm";
  return "Chi tiêu khác";
}

function chartData(transactions: Transaction[], referenceTime: number) {
  if (!referenceTime) return { points: [], max: 1 };
  const today = new Date(referenceTime); today.setHours(0, 0, 0, 0);
  const points = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today); date.setDate(today.getDate() - 6 + index);
    return { key: date.toDateString(), label: new Intl.DateTimeFormat("vi-VN", { weekday: "short" }).format(date).replace("Thứ ", "T"), income: 0, expense: 0 };
  });
  for (const transaction of transactions) {
    const date = new Date(toMillis(transaction.createdAt)); date.setHours(0, 0, 0, 0);
    const point = points.find((item) => item.key === date.toDateString());
    if (point) point[transaction.type] += transaction.amount;
  }
  const max = Math.max(1, ...points.flatMap((item) => [item.income, item.expense]));
  return { points, max };
}

export default function Home() {
  const [transactions, setTransactions] = useState(seed);
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setLoading] = useState(Boolean(auth && db));
  const [syncError, setSyncError] = useState("");
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => { void initializeAnalytics(); }, []);
  useEffect(() => {
    const list = messagesRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [messages]);
  useEffect(() => {
    if (!auth || !db) return;
    const firebaseAuth = auth; const firestore = db; let unsubscribeTransactions: (() => void) | undefined;
    const loadingTimer = window.setTimeout(() => setLoading(false), 3000);
    const unsubscribeAuth = onAuthStateChanged(firebaseAuth, (currentUser) => {
      unsubscribeTransactions?.(); setUser(currentUser); setLoading(false);
      window.clearTimeout(loadingTimer);
      if (!currentUser) { setTransactions(seed); return; }
      const ref = query(collection(firestore, "users", currentUser.uid, "transactions"), orderBy("createdAt", "desc"));
      unsubscribeTransactions = onSnapshot(ref, (snapshot) => { setTransactions(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Transaction)); setSyncError(""); }, () => setSyncError("Không thể đồng bộ giao dịch. Hãy kiểm tra Firestore Security Rules."));
    });
    return () => { window.clearTimeout(loadingTimer); unsubscribeAuth(); unsubscribeTransactions?.(); };
  }, []);

  async function persistTransaction(transaction: Transaction) {
    if (user && db) await addDoc(collection(db, "users", user.uid, "transactions"), { ...transaction, createdAt: Date.now() });
    else setTransactions((items) => [transaction, ...items]);
  }
  function parseTransaction(text: string): Transaction | null {
    const match = text.trim().match(/^(\+)?\s*(\d+(?:[.,]\d+)?)\s*(k|nghìn|tr|triệu|m)?\s+(.+)$/i);
    if (!match) return null;
    const multiplier = /^(tr|triệu|m)$/i.test(match[3] ?? "") ? 1_000_000 : /^(k|nghìn)$/i.test(match[3] ?? "") ? 1_000 : 1;
    const amount = Math.round(Number(match[2].replace(",", ".")) * multiplier);
    if (!Number.isSafeInteger(amount) || amount <= 0) return null;
    const type = match[1] ? "income" : "expense";
    const description = match[4];
    return { id: Date.now(), label: description.charAt(0).toUpperCase() + description.slice(1), category: categoryFor(description, type), amount, type, date: "Hôm nay", icon: type === "income" ? "✦" : "●", createdAt: Date.now() };
  }
  function reportFor(range: "today" | "week" | "month", dateText?: string, history = false) {
    const now = new Date();
    let start = new Date(now); start.setHours(0, 0, 0, 0);
    let end = new Date(start); end.setDate(end.getDate() + 1);
    if (range === "week") { const offset = (start.getDay() + 6) % 7; start.setDate(start.getDate() - offset); end = new Date(start); end.setDate(end.getDate() + 7); }
    if (range === "month") { start = new Date(now.getFullYear(), now.getMonth(), 1); end = new Date(now.getFullYear(), now.getMonth() + 1, 1); }
    if (dateText) { const match = dateText.match(/^(\d{4})-(\d{2})-(\d{2})$|^(\d{1,2})\/(\d{1,2})$/); if (!match) return "Cú pháp ngày: /day dd/mm hoặc /day yyyy-mm-dd"; const year = match[1] ? Number(match[1]) : now.getFullYear(); const month = Number(match[2] ?? match[4]) - 1; const day = Number(match[3] ?? match[5]); start = new Date(year, month, day); end = new Date(start); end.setDate(end.getDate() + 1); }
    const rows = transactions.filter((item) => { const value = item.createdAt && typeof item.createdAt === "object" && "toMillis" in item.createdAt && typeof item.createdAt.toMillis === "function" ? item.createdAt.toMillis() : typeof item.createdAt === "number" ? item.createdAt : Date.now(); return value >= start.getTime() && value < end.getTime(); });
    const period = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(start);
    const periodLabel = range === "week" ? `${new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" }).format(start)} – ${new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(end.getTime() - 1))}` : range === "month" ? new Intl.DateTimeFormat("vi-VN", { month: "long", year: "numeric" }).format(start) : period;
    if (history) return `📋 GIAO DỊCH · ${periodLabel}\n🕒 ${time()}\n\n${rows.map((item) => `${item.type === "income" ? "💰 +" : "💸 -"}${vnd(item.amount)} · ${item.label}`).join("\n") || "Chưa có giao dịch"}`;
    const income = rows.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amount, 0); const expense = rows.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);
    return `📊 BÁO CÁO ${range === "today" ? "HÔM NAY" : range === "week" ? "TUẦN NÀY" : "THÁNG NÀY"}\n📅 ${periodLabel}\n🕒 Cập nhật ${time()}\n\n💰 Thu nhập: ${vnd(income)}\n💸 Chi tiêu: ${vnd(expense)}\n💳 Dòng tiền: ${vnd(income - expense)}`;
  }
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const text = draft.trim(); if (!text) return; setDraft("");
    const userMessage: Message = { id: Date.now(), from: "user", text, time: time() }; setMessages((items) => [...items, userMessage]);
    if (text.toLowerCase() === "/help" || text.toLowerCase() === "/start") { setMessages((items) => [...items, { id: Date.now() + 1, from: "bot", text: "💰 THU CHI\n/in <số tiền> <mô tả>\n/ex <số tiền> <mô tả>\nhoặc: +500k freelance, 50k ăn sáng\n\n📅 BÁO CÁO\n/td · /day <dd/mm|yyyy-mm-dd> · /history <ngày>\n/week · /month\n\n🎯 KHÁC\n/budget · /recurring · /goal\n\nDùng k/nghìn hoặc tr/triệu.", time: time() }]); return; }
    if (text.toLowerCase() === "/dashboard") { setMessages((items) => [...items, { id: Date.now() + 1, from: "bot", text: "Dashboard đã được bỏ. Bạn cứ tiếp tục ghi thu chi ngay trong cuộc trò chuyện này nhé.", time: time() }]); return; }
    if (/^\/(td|week|month)$/i.test(text)) { const commandName = text.slice(1).toLowerCase(); setMessages((items) => [...items, { id: Date.now() + 1, from: "bot", text: reportFor(commandName === "td" ? "today" : commandName === "week" ? "week" : "month"), time: time() }]); return; }
    const reportMatch = text.match(/^\/(day|history)\s+(.+)$/i);
    if (reportMatch) { setMessages((items) => [...items, { id: Date.now() + 1, from: "bot", text: reportFor("today", reportMatch[2], reportMatch[1].toLowerCase() === "history"), time: time() }]); return; }
    if (/^\/(budget|recurring|goal)(?:\s|$)/i.test(text)) { setMessages((items) => [...items, { id: Date.now() + 1, from: "bot", text: "Lệnh này đã được nhận. Phần cấu hình chi tiết sẽ được đồng bộ trong Firebase ở bước tiếp theo.", time: time() }]); return; }
    const explicit = text.match(/^\/(in|ex)\s+(.+)$/i);
    const transaction = explicit ? parseTransaction(`${explicit[1].toLowerCase() === "in" ? "+" : ""}${explicit[2]}`) : parseTransaction(text);
    if (!transaction) { setMessages((items) => [...items, { id: Date.now() + 1, from: "bot", text: "Mình chưa hiểu số tiền. Hãy thử: 50k ăn sáng hoặc +15tr lương nhé.", time: time() }]); return; }
    try { await persistTransaction(transaction); setMessages((items) => [...items, { id: Date.now() + 2, from: "bot", text: `${transaction.type === "income" ? "Đã ghi nhận thu nhập" : "Đã ghi nhận chi tiêu"} rồi nhé!`, time: time(), transaction }]); }
    catch { setSyncError("Không thể lưu giao dịch vào Firestore."); setMessages((items) => [...items, { id: Date.now() + 3, from: "bot", text: "Mình chưa lưu được giao dịch. Bạn kiểm tra Firestore Security Rules giúp mình nhé.", time: time() }]); }
  }
  async function login() { if (!auth) return setSyncError("Firebase chưa được cấu hình."); try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch { setSyncError("Không thể đăng nhập Google. Hãy kiểm tra Google provider trong Firebase Authentication."); } }
  return <main className="finance-app chat-only">
    <header className="app-header"><button className="brand" type="button"><span>m</span>Mộc Chi</button><div className="header-actions">{user ? <button className="user-button" onClick={() => auth && signOut(auth)}>{user.photoURL ? <img src={user.photoURL} alt="" /> : "MC"}<span>Đăng xuất</span></button> : <button className="login-button" onClick={login} disabled={isLoading}>{isLoading ? "Đang tải" : "Đăng nhập Google"}</button>}</div></header>
    <section className="workspace"><Chat messages={messages} draft={draft} setDraft={setDraft} send={send} user={user} syncError={syncError} messagesRef={messagesRef} /></section>
  </main>;
}

function Chat({ messages, draft, setDraft, send, user, syncError, messagesRef }: { messages: Message[]; draft: string; setDraft: (value: string) => void; send: (event: FormEvent<HTMLFormElement>) => void; user: User | null; syncError: string; messagesRef: React.RefObject<HTMLDivElement | null> }) {
  return <section className="chat-screen"><div className="chat-title"><div className="bot-avatar">m</div><div><strong>Mộc Chi Finance</strong><small>{user ? "Đang đồng bộ giao dịch" : "Trợ lý tài chính cá nhân"}</small></div><i>●</i></div><div className="chat-status">{syncError ? syncError : user ? "Dữ liệu của bạn được lưu riêng tư trong Firestore" : "Đang ở chế độ demo — đăng nhập để lưu dữ liệu"}</div><div className="messages" ref={messagesRef}>{messages.map((message) => <div key={message.id} className={`message-row ${message.from}`}><div className="bubble"><p>{message.text}</p>{message.transaction && <div className={`receipt ${message.transaction.type}`}><span>{message.transaction.icon}</span><div><small>{message.transaction.type === "income" ? "THU NHẬP" : "CHI TIÊU"}</small><strong>{message.transaction.label}</strong></div><b>{message.transaction.type === "income" ? "+" : "−"}{vnd(message.transaction.amount)}</b></div>}<time>{message.time}</time></div></div>)}</div><div className="quick-prompts"><button type="button" onClick={() => setDraft("/ex 50k cà phê sáng")}>/ex 50k cà phê</button><button type="button" onClick={() => setDraft("/in 15tr lương tháng")}>/in 15tr lương</button><button type="button" onClick={() => setDraft("/td")}>Báo cáo hôm nay</button><button type="button" onClick={() => setDraft("/help")}>Hướng dẫn</button></div><form className="composer" onSubmit={send}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Nhắn tin cho Mộc Chi..." aria-label="Tin nhắn" /><button type="submit" aria-label="Gửi tin nhắn">↑</button></form></section>;
}

export function Dashboard({ totals, transactions, monthlyTransactions, referenceTime, removeTransaction }: { totals: { income: number; expense: number; balance: number }; transactions: Transaction[]; monthlyTransactions: Transaction[]; referenceTime: number; removeTransaction: (transaction: Transaction) => void }) {
  const chart = chartData(transactions, referenceTime);
  const budgets = budgetLimits.map((budget) => ({ ...budget, used: monthlyTransactions.filter((item) => item.type === "expense" && item.category === budget.name).reduce((sum, item) => sum + item.amount, 0) }));
  const axisLabels = [chart.max, chart.max * .75, chart.max * .5, chart.max * .25, 0].map((value) => value >= 1_000_000 ? `${(value / 1_000_000).toFixed(value % 1_000_000 ? 1 : 0)}tr` : value >= 1_000 ? `${Math.round(value / 1_000)}k` : "0đ");
  return <section className="dashboard"><div className="dashboard-title"><p className="eyebrow">CẬP NHẬT THEO THỜI GIAN THỰC</p><h1>Tổng quan tài chính</h1><p>Mọi thay đổi giao dịch đều phản ánh ngay trên dashboard.</p></div><section className="metric-grid"><Metric label="Số dư tháng này" value={totals.balance} className="balance" /><Metric label="Thu nhập" value={totals.income} className="income" /><Metric label="Chi tiêu" value={totals.expense} className="expense" /></section><section className="data-grid"><article className="dashboard-card chart-card"><div className="card-title"><div><p className="eyebrow">DÒNG TIỀN 7 NGÀY</p><h2>Thu chi theo ngày</h2></div><span className="live-label">● Live</span></div><div className="mini-chart"><div className="axis">{axisLabels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div><div className="chart-bars">{chart.points.map((point) => <div className="chart-day" key={point.key} title={`${point.label}: ${vnd(point.income)} thu, ${vnd(point.expense)} chi`}><div className="columns"><i style={{height:`${(point.income / chart.max) * 100}%`}} /><i style={{height:`${(point.expense / chart.max) * 100}%`}} /></div><small>{point.label}</small></div>)}</div></div><p className="legend"><span>● Thu nhập</span><span>● Chi tiêu</span></p></article><article className="dashboard-card"><div className="card-title"><div><p className="eyebrow">NGÂN SÁCH</p><h2>Tháng này</h2></div></div>{budgets.map((budget) => <Budget key={budget.name} {...budget} />)}</article></section><article className="dashboard-card recent"><div className="card-title"><div><p className="eyebrow">GIAO DỊCH</p><h2>Mới nhất</h2></div><span className="live-label">● Live</span></div>{transactions.length ? transactions.slice(0,5).map((item) => <div className="transaction" key={item.id}><b className={item.type}>{item.icon}</b><div><strong>{item.label}</strong><small>{item.category} · {displayDate(item, referenceTime)}</small></div><em className={item.type}>{item.type === "income" ? "+" : "−"}{vnd(item.amount)}</em><button className="delete-transaction" type="button" onClick={() => removeTransaction(item)} aria-label={`Xóa ${item.label}`}>×</button></div>) : <p className="empty-state">Chưa có giao dịch nào. Hãy ghi một khoản thu hoặc chi trong tab Trò chuyện.</p>}</article></section>;
}
function Metric({ label, value, className }: { label: string; value: number; className: string }) { return <article className={`metric ${className}`}><p>{label}</p><strong>{vnd(value)}</strong><small>{className === "balance" ? "↗ +12,4% so với tháng trước" : "Tháng 10"}</small></article>; }
function Budget({ name, used, total, color }: { name: string; used: number; total: number; color: string }) { const percent = Math.round(used / total * 100); return <div className="budget"><div><span>{name}</span><b className={percent >= 80 ? "warning" : ""}>{percent}%</b></div><small>{vnd(used)} / {vnd(total)}</small><i><u style={{width:`${Math.min(percent, 100)}%`,background:color}} /></i></div>; }
