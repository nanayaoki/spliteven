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
  const [showInvite, setShowInvite] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

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

  const copyInviteCode = async () => {
    if (!activeGroup?.join_code) return;
    try {
      await navigator.clipboard.writeText(activeGroup.join_code);
      setInviteCopied(true);
      window.setTimeout(() => setInviteCopied(false), 1800);
    } catch {
      setError('Could not copy the invite code. Please select and copy it manually.');
    }
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
    <main style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <div style={styles.brand}><div style={styles.logo}>S</div><div><div style={styles.title}>SplitSmart</div><div style={styles.subtitle}>Shared expenses, made simple</div></div></div>
          <div style={styles.headerActions}><span style={styles.userLabel}>Hi, {username}</span><button style={styles.logout} onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/login'; }}>Log out</button></div>
        </header>
        <div style={styles.layout}>
          <aside style={styles.sidebar}>
            <div style={styles.sideTitle}>Your groups</div>
            <div style={styles.groupList}>{groups.map((group) => <button key={group.id} style={{ ...styles.groupButton, ...(group.id === activeGroupId ? styles.activeGroup : {}) }} onClick={() => setActiveGroupId(group.id)}><span>{group.name.slice(0, 1).toUpperCase()}</span>{group.name}</button>)}</div>
            <div style={styles.groupForms}>
              <form onSubmit={createGroup}><label style={styles.formLabel}>Create new group</label><div style={styles.inlineForm}><input style={styles.input} value={newGroup} onChange={(event) => setNewGroup(event.target.value)} placeholder="e.g. Goa trip" /><button style={styles.primarySmall} type="submit">Create</button></div></form>
              <form onSubmit={joinGroup}><label style={styles.formLabel}>Join a group</label><div style={styles.inlineForm}><input style={styles.input} maxLength={6} value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="6-character code" /><button style={styles.secondarySmall} type="submit">Join</button></div></form>
            </div>
          </aside>
          <section style={styles.content}>
            {activeGroup ? <>
              <div style={styles.pageIntro}><div><p style={styles.eyebrow}>Overview</p><h1 style={styles.pageTitle}>{activeGroup.name}</h1><p style={styles.muted}>Invite code: <strong>{activeGroup.join_code}</strong></p></div><div style={styles.pageActions}><button style={styles.secondarySmall} onClick={() => setShowInvite((current) => !current)}>{showInvite ? 'Close invite' : 'Add member'}</button><button style={styles.primary} onClick={() => document.getElementById('expense-form')?.scrollIntoView({ behavior: 'smooth' })}>Add expense</button></div></div>
              {showInvite && <div style={styles.invitePanel}><div><strong>Invite someone to {activeGroup.name}</strong><p style={styles.muted}>Share this code with them. They can enter it under “Join a group” after creating an account.</p></div><div style={styles.inviteCode}><code>{activeGroup.join_code}</code><button style={styles.secondarySmall} onClick={copyInviteCode}>{inviteCopied ? 'Copied' : 'Copy code'}</button></div></div>}
              <div style={styles.stats}><div style={styles.stat}><span>Total expenses</span><strong>{inr(total)}</strong><small>{expenses.length} recorded</small></div><div style={styles.stat}><span>People</span><strong>{people.length}</strong><small>in this group</small></div><div style={styles.stat}><span>Your balance</span><strong style={{ color: (balances.find((person) => person.name === username)?.balance || 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>{inr(balances.find((person) => person.name === username)?.balance || 0)}</strong><small>net position</small></div></div>
              <div style={styles.dashboardGrid}>
                <section style={styles.panel}><div style={styles.panelHeader}><h2 style={styles.heading}>People & shares</h2><span style={styles.muted}>{people.length} members</span></div>{balances.map((person) => <div style={styles.personRow} key={person.id}><div style={styles.avatar}>{person.name.slice(0, 1).toUpperCase()}</div><div style={styles.personMain}><strong>{person.name}</strong><span>{person.balance >= 0 ? 'is owed' : 'owes'} {inr(Math.abs(person.balance))}</span></div><strong style={{ color: person.balance >= 0 ? 'var(--green)' : 'var(--red)' }}>{person.balance >= 0 ? '+' : '-'}{inr(Math.abs(person.balance))}</strong></div>)}</section>
                <section style={styles.panel}><div style={styles.panelHeader}><h2 style={styles.heading}>Recent expenses</h2><span style={styles.muted}>{inr(total)}</span></div>{expenses.length ? expenses.slice().reverse().map((expense) => <div style={styles.expenseRow} key={expense.id}><div style={styles.expenseIcon}>{expense.emoji}</div><div style={styles.personMain}><strong>{expense.name}</strong><span>Paid by {personName(expense.paidBy)} · {expense.participants.length} shares</span></div><strong>{inr(expense.amount)}</strong><button style={styles.remove} onClick={async () => { await fetch(`/api/expenses?id=${expense.id}&group_id=${activeGroupId}`, { method: 'DELETE' }); setExpenses((current) => current.filter((item) => item.id !== expense.id)); }}>×</button></div>) : <p style={styles.empty}>No expenses yet. Add your first one below.</p>}</section>
              </div>
              <section style={styles.panel} id="expense-form"><div style={styles.panelHeader}><div><h2 style={styles.heading}>Log an expense</h2><p style={styles.muted}>Choose who paid and who shares it.</p></div></div><form onSubmit={addExpense}><div style={styles.formGrid}><input style={styles.input} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What was it for?" /><input style={styles.input} type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount" /></div><div style={styles.formGrid}><label style={styles.formLabel}>Paid by<select style={styles.select} value={paidBy} onChange={(event) => setPaidBy(event.target.value)}>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><button style={styles.primary} type="submit">Save expense</button></div><div style={styles.splitHeader}><label style={styles.formLabel}>Split between</label><span style={styles.muted}>{participants.length} selected · {participants.length ? inr(Number(amount || 0) / participants.length) : inr(0)} each</span></div><div style={styles.memberChecks}>{people.map((person) => <label key={person.id} style={styles.check}><input type="checkbox" checked={participants.includes(person.id)} onChange={() => setParticipants((current) => current.includes(person.id) ? current.filter((id) => id !== person.id) : [...current, person.id])} /> {person.name}</label>)}</div></form><div style={styles.ai}><input style={styles.input} value={text} onChange={(event) => setText(event.target.value)} placeholder="Or describe it: dinner 1200 paid by Raj" /><button style={styles.secondarySmall} type="button" onClick={addAiExpense} disabled={isParsing}>{isParsing ? 'Reading…' : 'Use AI'}</button></div></section>
              <section style={styles.panel}><div style={styles.panelHeader}><h2 style={styles.heading}>Settle up</h2><span style={styles.muted}>Suggested transfers</span></div>{settlements.length ? settlements.map((transfer, index) => <div style={styles.transfer} key={`${transfer.from}-${transfer.to}-${index}`}><span><strong>{transfer.from}</strong> pays <strong>{transfer.to}</strong></span><strong>{inr(transfer.amount)}</strong></div>) : <p style={styles.empty}>Everyone is settled up.</p>}</section>
            </> : <div style={styles.blank}><h1>Start by creating a group</h1><p>Create a private space for a trip, home, or friends.</p></div>}
            {error && <div style={styles.error} role="alert">{error}</div>}
          </section>
        </div>
      </div>
    </main>
  );
}

const styles = {
  page: { minHeight: '100vh', padding: '28px 20px 52px' }, shell: { maxWidth: 1180, margin: '0 auto', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 18px 50px rgba(27,39,57,.08)' }, header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 28px', borderBottom: '1px solid var(--line)' }, brand: { display: 'flex', alignItems: 'center', gap: 12 }, logo: { width: 38, height: 38, borderRadius: 10, display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: 18, background: 'var(--blue)' }, title: { fontSize: 20, fontWeight: 800, letterSpacing: '-.02em' }, subtitle: { color: 'var(--muted)', fontSize: 12, marginTop: 2 }, headerActions: { display: 'flex', alignItems: 'center', gap: 18 }, userLabel: { color: 'var(--muted)', fontSize: 13 }, logout: { border: '1px solid var(--line)', borderRadius: 9, padding: '8px 12px', background: 'transparent', color: 'var(--ink)', fontWeight: 700 },
  layout: { display: 'grid', gridTemplateColumns: '250px 1fr' }, sidebar: { padding: 22, background: '#f6f7f5', borderRight: '1px solid var(--line)' }, sideTitle: { color: 'var(--muted)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }, groupList: { display: 'grid', gap: 5 }, groupButton: { display: 'flex', alignItems: 'center', gap: 9, width: '100%', border: 0, borderRadius: 9, padding: '10px 9px', textAlign: 'left', background: 'transparent', color: 'var(--ink)', fontWeight: 700 }, groupButtonSpan: { width: 26, height: 26 }, activeGroup: { background: '#e1e6ed', color: 'var(--ink)' }, groupForms: { display: 'grid', gap: 22, marginTop: 30 }, formLabel: { display: 'grid', gap: 7, color: 'var(--muted)', fontSize: 12, fontWeight: 700 }, inlineForm: { display: 'flex', gap: 5 }, input: { minWidth: 0, width: '100%', border: '1px solid #d9dee5', borderRadius: 8, padding: '10px 11px', background: '#fff', color: 'var(--ink)', outline: 'none' }, primarySmall: { border: 0, borderRadius: 8, padding: '0 11px', background: 'var(--blue)', color: '#fff', fontWeight: 700 }, secondarySmall: { border: '1px solid #cbd2dc', borderRadius: 8, padding: '0 12px', background: '#fff', color: 'var(--ink)', fontWeight: 700 }, content: { padding: '30px 34px 42px', minWidth: 0 }, pageIntro: { display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 16 }, pageActions: { display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'end' }, eyebrow: { margin: 0, color: 'var(--muted)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em' }, pageTitle: { margin: '5px 0 4px', fontSize: 28, letterSpacing: '-.03em' }, muted: { color: 'var(--muted)', fontSize: 12.5 }, primary: { border: 0, borderRadius: 8, padding: '11px 15px', background: 'var(--blue)', color: '#fff', fontWeight: 800 }, invitePanel: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginTop: 18, padding: 16, border: '1px solid #d9dee5', borderRadius: 10, background: '#f7f8f7' }, inviteCode: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, background: '#fff' }, splitHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 12 }, stats: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, margin: '28px 0 18px' }, stat: { display: 'grid', gap: 6, padding: 17, border: '1px solid var(--line)', borderRadius: 12, background: '#fbfbfa' }, statSpan: {}, statStrong: {}, statSmall: {}, dashboardGrid: { display: 'grid', gridTemplateColumns: '1fr 1.25fr', gap: 16 }, panel: { padding: 18, border: '1px solid var(--line)', borderRadius: 12, background: '#fff', marginTop: 16 }, panelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12, marginBottom: 12 }, heading: { margin: 0, fontSize: 16, letterSpacing: '-.01em' }, personRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderBottom: '1px solid #eef0f2' }, avatar: { width: 32, height: 32, display: 'grid', placeItems: 'center', borderRadius: '50%', background: '#e8ebef', color: 'var(--ink)', fontWeight: 800, fontSize: 13 }, personMain: { flex: 1, display: 'grid', gap: 3, minWidth: 0 }, personMainSpan: {}, expenseRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderBottom: '1px solid #eef0f2' }, expenseIcon: { width: 30, textAlign: 'center', fontSize: 18 }, remove: { border: 0, background: 'transparent', color: 'var(--muted)', fontSize: 20 }, formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '14px 0' }, select: { border: '1px solid #d9dee5', borderRadius: 8, padding: '10px', background: '#fff', color: 'var(--ink)' }, memberChecks: { display: 'flex', flexWrap: 'wrap', gap: 10 }, check: { border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', color: 'var(--ink)', fontSize: 13 }, ai: { display: 'flex', gap: 8, marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line)' }, transfer: { display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #eef0f2', fontSize: 14 }, error: { marginTop: 14, padding: 11, borderRadius: 8, color: '#9b2c25', background: '#fff4f2', border: '1px solid #f0d0cc' }, empty: { padding: '24px 0', color: 'var(--muted)', textAlign: 'center' }, blank: { padding: '100px 20px', textAlign: 'center', color: 'var(--muted)' },
};
