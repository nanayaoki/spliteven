'use client';

import { useEffect, useMemo, useState } from 'react';

const PEOPLE_KEY = 'splitsmart.people';
const EXPENSES_KEY = 'splitsmart.expenses';
const DEFAULT_PEOPLE = [
  { id: 'person-aisha', name: 'Aisha' },
  { id: 'person-raj', name: 'Raj' },
  { id: 'person-priya', name: 'Priya' },
  { id: 'person-you', name: 'You' },
];
const DEFAULT_EXPENSES = [
  {
    id: 'seed-dinner',
    name: 'Dinner',
    emoji: '🍽️',
    amount: 1800,
    paidBy: 'person-aisha',
    participants: DEFAULT_PEOPLE.map((person) => person.id),
  },
  {
    id: 'seed-cab',
    name: 'Cab',
    emoji: '🚕',
    amount: 400,
    paidBy: 'person-raj',
    participants: ['person-raj', 'person-you'],
  },
];

const inr = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN', {
  maximumFractionDigits: 2,
})}`;

function normalizePeople(value) {
  if (!Array.isArray(value) || value.length === 0) return DEFAULT_PEOPLE;
  return value
    .filter((person) => person && typeof person.id === 'string' && typeof person.name === 'string')
    .map((person) => ({ id: person.id, name: person.name.trim() }))
    .filter((person) => person.name);
}

function normalizeExpenses(value, people) {
  if (!Array.isArray(value)) return DEFAULT_EXPENSES;
  const validIds = new Set(people.map((person) => person.id));
  return value
    .filter((expense) => expense && Number(expense.amount) > 0)
    .map((expense) => {
      const paidBy = validIds.has(expense.paidBy)
        ? expense.paidBy
        : people.find((person) => person.name === expense.paidBy)?.id || people[0].id;
      const participants = Array.isArray(expense.participants)
        ? expense.participants.filter((id) => validIds.has(id))
        : people.slice(0, Math.max(1, Number(expense.people) || people.length)).map((person) => person.id);
      return {
        id: expense.id || `expense-${Date.now()}-${Math.random()}`,
        name: expense.name || 'Expense',
        emoji: expense.emoji || '🧾',
        amount: Number(expense.amount),
        paidBy,
        participants: participants.length ? participants : [paidBy],
      };
    });
}

function getSplits(expense) {
  const share = Number(expense.amount) / expense.participants.length;
  return expense.participants.map((personId) => ({ personId, share }));
}

export default function Home({ username }) {
  const peopleKey = `${PEOPLE_KEY}.${username}`;
  const expensesKey = `${EXPENSES_KEY}.${username}`;
  const [people, setPeople] = useState(DEFAULT_PEOPLE);
  const [expenses, setExpenses] = useState(DEFAULT_EXPENSES);
  const [newPerson, setNewPerson] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState('person-you');
  const [participants, setParticipants] = useState(DEFAULT_PEOPLE.map((person) => person.id));
  const [text, setText] = useState('');
  const [ready, setReady] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
      const savedPeople = normalizePeople(JSON.parse(localStorage.getItem(peopleKey) || 'null'));
      setPeople(savedPeople);
      const response = await fetch('/api/expenses');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load expenses.');
      const savedExpenses = result.expenses.length
        ? result.expenses
        : normalizeExpenses(JSON.parse(localStorage.getItem(expensesKey) || 'null'), savedPeople);
      setExpenses(normalizeExpenses(savedExpenses, savedPeople));
      setPaidBy((current) => savedPeople.some((person) => person.id === current) ? current : savedPeople[0].id);
      setParticipants(savedPeople.map((person) => person.id));
      } catch (loadError) {
        setError(loadError.message || 'Saved group data could not be loaded.');
      } finally {
        setReady(true);
      }
    };
    loadData();
  }, [expensesKey, peopleKey]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(peopleKey, JSON.stringify(people));
    localStorage.setItem(expensesKey, JSON.stringify(expenses));
  }, [expenses, expensesKey, people, peopleKey, ready]);

  const personName = (id) => people.find((person) => person.id === id)?.name || 'Unknown';
  const findPersonId = (name) => {
    const normalizedName = name.trim().toLowerCase();
    return people.find((person) => person.name.trim().toLowerCase() === normalizedName)?.id;
  };
  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

  const balances = useMemo(() => {
    const values = new Map(people.map((person) => [person.id, 0]));
    expenses.forEach((expense) => {
      const share = Number(expense.amount) / expense.participants.length;
      values.set(expense.paidBy, (values.get(expense.paidBy) || 0) + Number(expense.amount));
      expense.participants.forEach((personId) => {
        values.set(personId, (values.get(personId) || 0) - share);
      });
    });
    return people.map((person) => ({
      ...person,
      balance: Math.round((values.get(person.id) || 0) * 100) / 100,
    }));
  }, [expenses, people]);

  const settlements = useMemo(() => {
    const creditors = balances.filter((person) => person.balance > 0.005)
      .map((person) => ({ ...person, amount: person.balance }))
      .sort((a, b) => b.amount - a.amount);
    const debtors = balances.filter((person) => person.balance < -0.005)
      .map((person) => ({ ...person, amount: -person.balance }))
      .sort((a, b) => b.amount - a.amount);
    const result = [];
    let creditorIndex = 0;
    let debtorIndex = 0;
    while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
      const creditor = creditors[creditorIndex];
      const debtor = debtors[debtorIndex];
      const amountDue = Math.min(creditor.amount, debtor.amount);
      result.push({ from: debtor.name, to: creditor.name, amount: Math.round(amountDue * 100) / 100 });
      creditor.amount -= amountDue;
      debtor.amount -= amountDue;
      if (creditor.amount < 0.005) creditorIndex += 1;
      if (debtor.amount < 0.005) debtorIndex += 1;
    }
    return result;
  }, [balances]);

  const toggleParticipant = (personId) => {
    setParticipants((current) => current.includes(personId)
      ? current.filter((id) => id !== personId)
      : [...current, personId]);
  };

  const addPerson = (event) => {
    event.preventDefault();
    const name = newPerson.trim();
    if (!name) return;
    if (people.some((person) => person.name.toLowerCase() === name.toLowerCase())) {
      setError('That person is already in the group.');
      return;
    }
    const person = { id: `person-${Date.now()}`, name };
    setPeople((current) => [...current, person]);
    setParticipants((current) => [...current, person.id]);
    setNewPerson('');
    setError('');
  };

  const addExpense = (event) => {
    event?.preventDefault();
    const numericAmount = Number(amount);
    if (!description.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Add a description and an amount greater than zero.');
      return;
    }
    if (!participants.length) {
      setError('Choose at least one person to split this expense.');
      return;
    }
    const expense = {
      name: description.trim(),
      emoji: '🧾',
      amount: Math.round(numericAmount * 100) / 100,
      paidBy,
      participants,
    };
    saveExpense(expense);
  };

  const saveExpense = async (expense) => {
    try {
      const response = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(expense),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save the expense.');
      setExpenses((current) => [...current, result.expense]);
      setDescription('');
      setAmount('');
      setError('');
    } catch (saveError) {
      setError(saveError.message);
    }
  };

  const removeExpense = async (id) => {
    try {
      const response = await fetch(`/api/expenses?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Could not remove the expense.');
      setExpenses((current) => current.filter((item) => item.id !== id));
    } catch (removeError) {
      setError(removeError.message);
    }
  };

  const addAiExpense = async () => {
    const sentence = text.trim();
    if (!sentence || isParsing) return;
    setIsParsing(true);
    setError('');
    try {
      const response = await fetch('/api/parse-expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sentence }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not parse that expense.');
      const count = Math.min(Math.max(Number(result.people) || people.length, 1), people.length);
      const namedParticipantIds = (result.participantNames || [])
        .map((name) => findPersonId(name))
        .filter(Boolean);
      const unknownNames = (result.participantNames || [])
        .filter((name) => !findPersonId(name));
      if (unknownNames.length) {
        throw new Error(`Add ${unknownNames.join(', ')} to People before logging this expense.`);
      }
      const aiParticipants = namedParticipantIds.length
        ? namedParticipantIds
        : people.slice(0, count).map((person) => person.id);
      const aiPaidBy = findPersonId(result.paidBy) || findPersonId('You');
      await saveExpense({
        name: result.description.charAt(0).toUpperCase() + result.description.slice(1),
        emoji: '✨',
        amount: result.amount,
        paidBy: aiPaidBy || people[0].id,
        participants: aiParticipants,
      });
      setText('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsParsing(false);
    }
  };

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <header style={styles.header}>
          <div style={styles.brand}><div style={styles.logo}>S</div><div><div style={styles.title}>SplitSmart</div><div style={styles.subtitle}>Make every bill feel easy.</div></div></div>
          <div style={styles.headerActions}><div style={styles.groupPill}>{username}&apos;s Group</div><button style={styles.logoutButton} type="button" onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/login'; }}>Log out</button></div>
        </header>

        <section style={styles.section}>
          <div style={styles.sectionHeading}><div><h2 style={styles.heading}>People</h2><p style={styles.muted}>Who is sharing the group bills?</p></div><span style={styles.count}>{people.length}</span></div>
          <div style={styles.peopleList}>{people.map((person) => <span style={styles.personChip} key={person.id}>{person.name}</span>)}</div>
          <form onSubmit={addPerson} style={styles.inlineForm}>
            <input style={styles.input} value={newPerson} onChange={(event) => setNewPerson(event.target.value)} placeholder="Add a person" aria-label="New person name" />
            <button style={styles.secondaryBtn} type="submit">Add</button>
          </form>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>Add an expense</h2>
          <form onSubmit={addExpense}>
            <div style={styles.formGrid}>
              <input style={styles.input} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What was it? (Dinner)" aria-label="Expense description" />
              <input style={styles.input} type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount" aria-label="Expense amount" />
            </div>
            <div style={styles.formRow}><label style={styles.label}>Paid by <select style={styles.select} value={paidBy} onChange={(event) => setPaidBy(event.target.value)}>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><button style={styles.addBtn} type="submit">Log expense</button></div>
            <div style={styles.label}>Split between</div>
            <div style={styles.checkList}>{people.map((person) => <label style={styles.checkItem} key={person.id}><input type="checkbox" checked={participants.includes(person.id)} onChange={() => toggleParticipant(person.id)} />{person.name}</label>)}</div>
          </form>
        </section>

        <section style={styles.aiBox}>
          <div><h2 style={styles.heading}>Use the AI shortcut</h2><p style={styles.muted}>Try “dinner 1200, split with 3 friends”. It logs an expense paid by You.</p></div>
          <div style={styles.addRow}><input style={styles.input} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && addAiExpense()} placeholder="Describe an expense…" aria-label="Describe an expense" /><button style={styles.addBtn} type="button" onClick={addAiExpense} disabled={isParsing}>{isParsing ? '…' : '✨'}</button></div>
        </section>
        {error && <div style={styles.error} role="alert">{error}</div>}

        <section style={styles.section}>
          <div style={styles.sectionHeading}><div><h2 style={styles.heading}>Expenses</h2><p style={styles.muted}>{expenses.length} logged · {inr(total)} total</p></div></div>
          <div style={styles.list}>{expenses.length === 0 && <div style={styles.empty}>No expenses yet — log your first one above.</div>}{expenses.map((expense) => <div key={expense.id} style={styles.item}><div style={styles.itemEmoji}>{expense.emoji}</div><div style={styles.itemMain}><div style={styles.itemName}>{expense.name}</div><div style={styles.itemPaid}>paid by {personName(expense.paidBy)} · split {expense.participants.length} ways · {inr(expense.amount / expense.participants.length)} each</div></div><div style={styles.itemAmount}>{inr(expense.amount)}</div><button style={styles.remove} type="button" onClick={() => removeExpense(expense.id)} aria-label={`Remove ${expense.name}`}>×</button></div>)}</div>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>Balances</h2>
          <div style={styles.balanceList}>{balances.map((person) => <div style={styles.balanceRow} key={person.id}><span>{person.name}</span><strong style={{ color: person.balance > 0.005 ? 'var(--green)' : person.balance < -0.005 ? 'var(--red)' : 'var(--muted)' }}>{person.balance > 0.005 ? '+' : ''}{inr(person.balance)}</strong></div>)}</div>
        </section>

        <section style={styles.settleBox}>
          <h2 style={styles.heading}>Settle up</h2>
          {settlements.length ? <div style={styles.settlementList}>{settlements.map((settlement, index) => <div style={styles.settlement} key={`${settlement.from}-${settlement.to}-${index}`}><span><strong>{settlement.from}</strong> pays <strong>{settlement.to}</strong></span><strong>{inr(settlement.amount)}</strong></div>)}</div> : <p style={styles.muted}>Everyone is settled up 🎉</p>}
        </section>
      </div>
      <p style={styles.footnote}>SplitSmart · people and expenses are saved in this browser.</p>
    </main>
  );
}

const styles = {
  page: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px 16px 48px' },
  card: { width: '100%', maxWidth: 560, background: 'var(--card)', borderRadius: 24, boxShadow: '0 24px 60px -24px rgba(13,27,62,.28)', border: '1px solid var(--line)', padding: 20, marginTop: 12 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
  headerActions: { display: 'flex', alignItems: 'center', gap: 8 },
  logoutButton: { border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  brand: { display: 'flex', alignItems: 'center', gap: 10 }, logo: { width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: 19, background: 'linear-gradient(135deg, var(--blue), var(--cyan))' }, title: { fontSize: 21, fontWeight: 800 }, subtitle: { color: 'var(--muted)', fontSize: 12, marginTop: 2 }, groupPill: { fontSize: 12.5, fontWeight: 800, color: 'var(--blue)', background: 'rgba(28,95,212,.1)', padding: '6px 12px', borderRadius: 999 },
  section: { borderTop: '1px solid var(--line)', paddingTop: 18, marginTop: 18 }, sectionHeading: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, heading: { fontSize: 16, margin: 0 }, muted: { color: 'var(--muted)', fontSize: 12.5, margin: '5px 0 0' }, count: { color: 'var(--blue)', background: '#edf3ff', borderRadius: 999, padding: '4px 9px', fontSize: 12, fontWeight: 800 },
  peopleList: { display: 'flex', flexWrap: 'wrap', gap: 7, margin: '13px 0' }, personChip: { background: '#f0f5ff', color: 'var(--blue)', borderRadius: 999, padding: '7px 11px', fontSize: 13, fontWeight: 700 }, inlineForm: { display: 'flex', gap: 8 }, input: { flex: 1, minWidth: 0, border: '1px solid var(--line)', borderRadius: 12, padding: '11px 13px', fontSize: 14, outline: 'none', background: '#f7f9fc', color: 'var(--ink)' }, secondaryBtn: { border: '1px solid var(--line)', borderRadius: 12, padding: '0 15px', background: '#fff', color: 'var(--blue)', fontWeight: 800 },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 130px', gap: 8, marginTop: 12 }, formRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, margin: '10px 0 14px' }, label: { color: 'var(--muted)', fontSize: 12.5, fontWeight: 700 }, select: { marginLeft: 5, border: '1px solid var(--line)', borderRadius: 9, padding: '6px 8px', color: 'var(--ink)', background: '#fff' }, checkList: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }, checkItem: { display: 'flex', alignItems: 'center', gap: 5, background: '#f7f9fc', border: '1px solid var(--line)', borderRadius: 9, padding: '7px 9px', fontSize: 12.5 },
  addRow: { display: 'flex', gap: 8, marginTop: 12 }, addBtn: { flex: 'none', minWidth: 48, borderRadius: 12, border: 'none', color: '#fff', fontSize: 16, fontWeight: 800, padding: '0 14px', background: 'linear-gradient(135deg, var(--blue), var(--cyan))' }, aiBox: { background: '#f2f7ff', border: '1px solid #dce9ff', borderRadius: 16, padding: 15, marginTop: 18 }, error: { color: '#b42318', background: '#fff1f0', borderRadius: 10, padding: '9px 12px', fontSize: 13, marginTop: 12 },
  list: { display: 'flex', flexDirection: 'column', gap: 9, marginTop: 13 }, empty: { color: 'var(--muted)', fontSize: 14, textAlign: 'center', padding: '18px 0' }, item: { display: 'flex', alignItems: 'center', gap: 10, background: '#f7f9fc', border: '1px solid var(--line)', borderRadius: 14, padding: '10px 12px' }, itemEmoji: { width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: '#fff', border: '1px solid var(--line)', fontSize: 17, flex: 'none' }, itemMain: { flex: 1, minWidth: 0 }, itemName: { fontWeight: 700, fontSize: 14 }, itemPaid: { color: 'var(--muted)', fontSize: 11.5, marginTop: 2 }, itemAmount: { fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap' }, remove: { flex: 'none', width: 24, height: 24, borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: 19, lineHeight: 1 },
  balanceList: { marginTop: 12 }, balanceRow: { display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--line)', fontSize: 14 }, settleBox: { background: '#f7f9fc', border: '1px solid var(--line)', borderRadius: 16, padding: 15, marginTop: 18 }, settlementList: { display: 'flex', flexDirection: 'column', gap: 9, marginTop: 12 }, settlement: { display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, background: '#fff', borderRadius: 10, padding: '10px 11px' }, footnote: { color: 'var(--muted)', fontSize: 12.5, textAlign: 'center', lineHeight: 1.6, marginTop: 20, maxWidth: 560 },
};
