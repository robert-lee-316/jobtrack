import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, BookOpen, Check, ChevronUp, LogOut, Settings } from 'lucide-react';

export function Count({ value }) {
  return value > 0 ? <span aria-hidden="true" className="notice-count">{value > 99 ? '99+' : value}</span> : null;
}

export function AccountMenu({ name, email, role, initials, count, navigate, signOut }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef(null);
  const popup = useRef(null);
  const [position, setPosition] = useState({});
  useEffect(() => {
    if (!open) return;
    function place() {
      const box = anchor.current.getBoundingClientRect();
      setPosition({ left: Math.max(6, box.left), bottom: window.innerHeight - box.top + 6 });
    }
    function dismiss(e) {
      if (!anchor.current.contains(e.target) && !popup.current?.contains(e.target)) setOpen(false);
    }
    function escape(e) {
      if (e.key === 'Escape') { setOpen(false); anchor.current.focus(); }
    }
    place();
    popup.current?.querySelector('button')?.focus();
    window.addEventListener('resize', place);
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('resize', place);
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  function select(action) { setOpen(false); action(); }
  return <>
    <button ref={anchor} className="account-trigger" aria-label={'Account menu, ' + count + ' unread'} aria-expanded={open} onClick={() => setOpen(!open)}>
      <span className="avatar">{initials}</span><span className="profile-name"><b>{name}</b><small>{role}</small></span><Count value={count}/><ChevronUp size={14}/>
    </button>
    {open && createPortal(<div className="account-popup" style={position} ref={popup} onBlur={e => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget) && e.relatedTarget !== anchor.current) setOpen(false); }}>
      <div className="account-summary"><strong>{name}</strong><small>{email}</small></div>
      {[[Settings,'Settings'],[Bell,'Notifications'],[BookOpen,'Guide']].map(([Icon,label]) =>
        <button key={label} onClick={() => select(() => navigate(label))}><Icon size={16}/>{label}{label === 'Notifications' && <Count value={count}/>}</button>)}
      <button className="logout-row" onClick={() => select(signOut)}><LogOut size={16}/>Sign out</button>
    </div>, document.body)}
  </>;
}

export function Notifications({ items, error, loading, reload, mark, admin, recipients, send }) {
  const [filter, setFilter] = useState('All');
  const [busy, setBusy] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  const [feedback, setFeedback] = useState('');
  const unread = items.filter(n => !n.read);
  const visible = filter === 'Unread' ? unread : items;
  async function act(fn) {
    setBusy(true); setFeedback('');
    try { await fn(); } catch (e) { setFeedback(e.message); }
    finally { setBusy(false); }
  }
  return <section className="inbox-page">
    <div className="page-top"><div><h1>Notifications</h1><p className="muted">Messages from JobTrack and your admin from the past seven days.</p></div>
      <button className="outline-btn" disabled={!unread.length || busy} onClick={() => act(() => mark(unread.map(n => n.id)))}><Check size={15}/>Mark all read</button></div>
    <div className="range-switch inbox-switch">{['All','Unread'].map(f => <button key={f} aria-pressed={filter === f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>{f}</button>)}</div>
    {error && <div className="alert error" role="alert">{error}<button onClick={reload}>Retry</button></div>}
    {feedback && <p role="status">{feedback}</p>}
    {visible.map(n => <button key={n.id} className="inbox-row" aria-label={n.message + (n.read ? ', read' : ', mark as read')} disabled={n.read || busy}
      onClick={() => act(() => mark([n.id]))}><span className="inbox-icon"><Bell size={16}/></span>
      <span><b>{n.message}</b><small>{n.source} · {new Date(n.createdAt).toLocaleString(undefined, { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })}</small></span>
      {!n.read && <i className="unread-dot"/>}</button>)}
    {!visible.length && !error && <p className="panel muted">{loading ? 'Loading notifications…' : filter === 'Unread' ? 'You’re all caught up.' : 'No notifications in the past seven days.'}</p>}
    {admin && <form className="panel admin-notice" onSubmit={e => { e.preventDefault(); act(async () => { await send(recipient,message); setMessage(''); setFeedback('Message sent.'); }); }}>
      <h3>Send a notification</h3><label className="field">Recipient<select required value={recipient} onChange={e => setRecipient(e.target.value)}><option value="">Choose a member</option>{recipients.map(m => <option value={m.id} key={m.id}>{m.full_name || m.email}</option>)}</select></label>
      <label className="field">Message<textarea required maxLength={2000} value={message} onChange={e => setMessage(e.target.value)}/></label>
      <button className="primary-btn" disabled={busy || !message.trim()}>Send notification</button></form>}
  </section>;
}

export function NotificationBell({ items, count, mark, openInbox, loading, error, refresh }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const wrapper = useRef(null);
  const trigger = useRef(null);
  useEffect(() => {
    if (!open) return;
    function outside(event) {
      if (!wrapper.current?.contains(event.target)) setOpen(false);
    }
    function escape(event) {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  async function read(ids) {
    setSaving(true); setFeedback('');
    try { await mark(ids); } catch (e) { setFeedback(e.message); }
    finally { setSaving(false); }
  }
  return <div className="notice-control" ref={wrapper} onBlur={e => {
    if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setOpen(false);
  }}>
    <button ref={trigger} className="icon-button bell-button" title="Notifications"
      aria-expanded={open} aria-label={'Notifications, ' + count + ' unread'}
      onClick={() => { if (!open) { setFeedback(''); refresh(); } setOpen(!open); }}>
      <Bell size={17}/><Count value={count}/>
    </button>
    {open && <section className="notice-preview" aria-label="Recent notifications">
      <header><strong>Notifications</strong><button className="outline-btn" disabled={!count || saving} onClick={() => read(items.filter(n => !n.read).map(n => n.id))}><Check size={13}/>Mark all read</button></header>
      {(feedback || error) && <p role="alert">{feedback || error}</p>}
      {!items.length && !error && <p>{loading ? 'Loading notifications…' : 'No recent notifications.'}</p>}
      {items.slice(0, 3).map(n => <button key={n.id} className="notice-preview-row" disabled={n.read || saving}
        title={n.message} onClick={() => read([n.id])}><Bell size={15}/><span>{n.message}</span><time dateTime={n.createdAt}>{new Date(n.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</time>{!n.read && <i className="unread-dot"/>}</button>)}
      <footer><button className="outline-btn" onClick={() => {setOpen(false);openInbox();}}>See all notifications</button></footer>
    </section>}
  </div>;
}
