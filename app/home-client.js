'use client';

import { useEffect, useMemo, useState } from 'react';
import { readJsonResponse } from '../lib/response';

const inr = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function Home({ username }) {
  const [groups, setGroups] = useState([]);
  const [activeGroupId, setActiveGroupId] = useState('');
  const [expenses, setExpenses] = useState([]);
  const [people, setPeople] = useState([]);
  const [newGroup, setNewGroup] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState('you');
  const [participants, setParticipants] = useState(['you']);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState('');

  const activeGroup = groups.find((group) => group.id === activeGroupId);
  const personName = (id) => people.find((person) => person.id === id)?.name || id;

  const loadGroups = async () => {
    const result = await readJsonResponse(await fetch('/api/groups'), 'Could not load groups.');
    setGroups(result.groups);
    if (!activeGroupId && result.groups[0]) setActiveGroupId(result.groups[0].id);
  };

  const loadExpenses = async (groupId) => {
    if (!groupId) return;
    const result = await readJsonResponse(await fetch(`/api/expenses?group_id=${encodeURIComponent(groupId)}`), 'Could not load group expenses.');
    setExpenses(result.expenses);
  };

  useEffect(() => {
    loadGroups().catch((loadError) => setError(loadError.message)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (activeGroupId) loadExpenses(activeGroupId).catch((loadError) => setError(loadError.message));
  }, [activeGroupId]);

  useEffect(() => {
    const members = groups.find((group) => group.id === activeGroupId)?.members || [];
    setPeople(members);
    setPaidBy(members[0]?.id || '');
    setParticipants(members.map((member) => member.id));
    setExpenses([]);
  }, [activeGroupId, groups, username]);

  const createGroup = async (event) => {
    event.preventDefault();
    if (!newGroup.trim()) return;
    try {
      const result = await readJsonResponse(await fetch('/api/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newGroup }) }), 'Could not create the group.');
      await loadGroups();
      setActiveGroupId(result.group.id);
      setNewGroup('');
      setError('');
    } catch (createError) { setError(createError.message); }
  };

  const joinGroup = async (event) => {
    event.preventDefault();
    try {
      const result = await readJsonResponse(await fetch('/api/groups/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: joinCode }) }), 'Could not join the group.');
      await loadGroups();
      setActiveGroupId(result.groupId);
      setJoinCode('');
      setError('');
    } catch (joinError) { setError(joinError.message); }
  };

  const saveExpense = async (expense) => {
    if (!activeGroupId) { setError('Create or join a group before adding expenses.'); return; }
    try {
      const result = await readJsonResponse(await fetch('/api/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...expense, groupId: activeGroupId }) }), 'Could not save the expense.');
      setExpenses((current) => [...current, result.expense]);
      setDescription('');
      setAmount('');
      setError('');
    } catch (saveError) { setError(saveError.message); }
  };

  const addExpense = (event) => {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!description.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0 || !participants.length) {
      setError('Add a description, amount, and at least one participant.');
      return;
    }
    saveExpense({ name: description.trim(), amount: numericAmount, paidBy, participants, emoji: '🧾' });
  };

  const addAiExpense = async () => {
    if (!text.trim() || isParsing) return;
    setIsParsing(true);
    try {
      const result = await readJsonResponse(await fetch('/api/parse-expense', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }), 'Could not parse that expense.');
      const named = result.participantNames?.map((name) => people.find((person) => person.name.toLowerCase() === name.toLowerCase())?.id).filter(Boolean);
      const payer = people.find((person) => person.name.toLowerCase() === result.paidBy?.toLowerCase())?.id;
      if (!payer || (result.participantNames?.length && named.length !== result.participantNames.length)) {
        throw new Error('The AI mentioned someone who is not in this group. Add them before logging this expense.');
      }
      await saveExpense({ name: result.description, amount: result.amount, paidBy: payer, participants: named?.length ? named : people.map((person) => person.id), emoji: '✨' });
      setText('');
    } catch (parseError) { setError(parseError.message); } finally { setIsParsing(false); }
  };

  const balances = useMemo(() => {
    const values = new Map(people.map((person) => [person.id, 0]));
    expenses.forEach((expense) => {
      const share = expense.amount / expense.participants.length;
      values.set(expense.paidBy, (values.get(expense.paidBy) || 0) + expense.amount);
      expense.participants.forEach((id) => values.set(id, (values.get(id) || 0) - share));
    });
    return people.map((person) => ({ ...person, balance: Math.round((values.get(person.id) || 0) * 100) / 100 }));
  }, [expenses, people]);

  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const settlements = useMemo(() => {
    const creditors = balances.filter((person) => person.balance > 0.005).map((person) => ({ ...person })).sort((a, b) => b.balance - a.balance);
    const debtors = balances.filter((person) => person.balance < -0.005).map((person) => ({ ...person, balance: -person.balance })).sort((a, b) => b.balance - a.balance);
    const transfers = [];
    let debtorIndex = 0;
    let creditorIndex = 0;
    while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
      const amount = Math.min(debtors[debtorIndex].balance, creditors[creditorIndex].balance);
      transfers.push({ from: debtors[debtorIndex].name, to: creditors[creditorIndex].name, amount: Math.round(amount * 100) / 100 });
      debtors[debtorIndex].balance -= amount;
      creditors[creditorIndex].balance -= amount;
      if (debtors[debtorIndex].balance < 0.005) debtorIndex += 1;
      if (creditors[creditorIndex].balance < 0.005) creditorIndex += 1;
    }
    return transfers;
  }, [balances]);

  return (
    <main style={styles.page}><div style={styles.card}>
      <header style={styles.header}><div style={styles.brand}><div style={styles.logo}>S</div><div><div style={styles.title}>SplitSmart</div><div style={styles.subtitle}>{username}&apos;s groups</div></div></div><button style={styles.logout} onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/login'; }}>Log out</button></header>
      <section style={styles.section}><h2 style={styles.heading}>Groups</h2><div style={styles.groupRow}>{groups.map((group) => <button key={group.id} style={{ ...styles.groupButton, ...(group.id === activeGroupId ? styles.activeGroup : {}) }} onClick={() => setActiveGroupId(group.id)}>{group.name}</button>)}</div><div style={styles.forms}><form onSubmit={createGroup}><input style={styles.input} value={newGroup} onChange={(event) => setNewGroup(event.target.value)} placeholder="New group name" /><button style={styles.secondary} type="submit">Create</button></form><form onSubmit={joinGroup}><input style={styles.input} value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder="Join code" /><button style={styles.secondary} type="submit">Join</button></form></div>{activeGroup && <p style={styles.muted}>Invite code: <strong>{activeGroup.join_code}</strong></p>}</section>
      {activeGroup ? <><section style={styles.section}><h2 style={styles.heading}>Add an expense</h2><form onSubmit={addExpense}><div style={styles.formGrid}><input style={styles.input} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Dinner" /><input style={styles.input} type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount" /></div><div style={styles.formRow}><label>Paid by <select value={paidBy} onChange={(event) => setPaidBy(event.target.value)}>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><button style={styles.addButton} type="submit">Log expense</button></div><label style={styles.muted}>Split between</label><div style={styles.checkList}>{people.map((person) => <label key={person.id} style={{ display: 'block' }}><input type="checkbox" checked={participants.includes(person.id)} onChange={() => setParticipants((current) => current.includes(person.id) ? current.filter((id) => id !== person.id) : [...current, person.id])} /> {person.name}</label>)}</div></form><div style={styles.ai}><input style={styles.input} value={text} onChange={(event) => setText(event.target.value)} placeholder="Try: dinner 1200" /><button style={styles.addButton} type="button" onClick={addAiExpense} disabled={isParsing}>✨</button></div></section><section style={styles.section}><h2 style={styles.heading}>Expenses <span style={styles.muted}>· {inr(total)}</span></h2>{expenses.map((expense) => <div style={styles.item} key={expense.id}><span>{expense.emoji}</span><div style={styles.main}><strong>{expense.name}</strong><small>paid by {personName(expense.paidBy)} · {expense.participants.length} ways</small></div><strong>{inr(expense.amount)}</strong><button style={styles.remove} onClick={async () => { await fetch(`/api/expenses?id=${expense.id}&group_id=${activeGroupId}`, { method: 'DELETE' }); setExpenses((current) => current.filter((item) => item.id !== expense.id)); }}>×</button></div>)}</section><section style={styles.settle}><h2 style={styles.heading}>Balances</h2>{balances.map((person) => <div style={styles.balance} key={person.id}><span>{person.name}</span><strong>{person.balance > 0 ? '+' : ''}{inr(person.balance)}</strong></div>)}<h3 style={styles.subheading}>Settle up</h3>{settlements.length ? settlements.map((transfer, index) => <div style={styles.balance} key={`${transfer.from}-${transfer.to}-${index}`}><span>{transfer.from} pays {transfer.to}</span><strong>{inr(transfer.amount)}</strong></div>) : <p style={styles.muted}>Everyone is settled up.</p>}</section></> : <div style={styles.empty}>{loading ? 'Loading groups…' : 'Create a group or join one with a code to begin.'}</div>}
      {error && <div style={styles.error} role="alert">{error}</div>}
    </div><p style={styles.footnote}>Each group is a private tenant. Expenses are filtered and protected by Supabase RLS.</p></main>
  );
}

const styles = {
  page: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px 16px 48px' },
  card: { width: '100%', maxWidth: 620, background: 'var(--card)', borderRadius: 24, boxShadow: '0 24px 60px -24px rgba(13,27,62,.28)', border: '1px solid var(--line)', padding: 20 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, brand: { display: 'flex', alignItems: 'center', gap: 10 }, logo: { width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: 19, background: 'linear-gradient(135deg, var(--blue), var(--cyan))' }, title: { fontSize: 21, fontWeight: 800 }, subtitle: { color: 'var(--muted)', fontSize: 12 }, logout: { border: 0, background: 'transparent', color: 'var(--muted)', fontWeight: 700 },
  section: { borderTop: '1px solid var(--line)', paddingTop: 18, marginTop: 18 }, heading: { fontSize: 16, margin: 0 }, subheading: { fontSize: 14, margin: '16px 0 4px' }, muted: { color: 'var(--muted)', fontSize: 12.5 }, groupRow: { display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }, groupButton: { border: '1px solid var(--line)', borderRadius: 999, background: '#f7f9fc', padding: '8px 12px', fontWeight: 700 }, activeGroup: { color: '#fff', background: 'var(--blue)' }, forms: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }, 'forms form': { display: 'flex', gap: 6 }, input: { minWidth: 0, flex: 1, border: '1px solid var(--line)', borderRadius: 11, padding: '10px 12px', background: '#f7f9fc' }, secondary: { border: 0, borderRadius: 11, padding: '0 12px', color: 'var(--blue)', fontWeight: 800 }, formGrid: { display: 'grid', gridTemplateColumns: '1fr 130px', gap: 8, margin: '12px 0' }, formRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }, addButton: { border: 0, borderRadius: 11, padding: '10px 14px', color: '#fff', fontWeight: 800, background: 'linear-gradient(135deg, var(--blue), var(--cyan))' }, checkList: { marginTop: 8 }, ai: { display: 'flex', gap: 8, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }, item: { display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderBottom: '1px solid var(--line)' }, main: { flex: 1, display: 'grid', gap: 3 }, 'main small': { color: 'var(--muted)' }, remove: { border: 0, background: 'transparent', color: 'var(--muted)', fontSize: 20 }, settle: { marginTop: 18, padding: 14, borderRadius: 14, background: '#f7f9fc' }, balance: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)' }, error: { marginTop: 14, padding: 10, borderRadius: 10, color: '#b42318', background: '#fff1f0' }, empty: { padding: '35px 0', color: 'var(--muted)', textAlign: 'center' }, footnote: { color: 'var(--muted)', fontSize: 12, textAlign: 'center' },
};
