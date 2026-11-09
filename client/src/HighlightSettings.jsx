import React, {useEffect, useState} from 'react';

export function HighlightSettings({request}) {
  const [prefs,setPrefs] = useState(null), [words,setWords] = useState('');
  const [message,setMessage] = useState(''), [saving,setSaving] = useState(false);
  const [attempt,retry] = useState(0);
  useEffect(() => {
    let active = true;
    request('/highlights').then(data => {
      if (active) {setPrefs(data); setWords(data.keywords.join('\n')); setMessage('');}
    }).catch(error => {if (active) setMessage(error.message);});
    return () => {active = false;};
  },[attempt]);
  function change(field,value) {setPrefs({...prefs,[field]:value}); setMessage('');}
  async function save(e) {
    e.preventDefault(); setSaving(true); setMessage('');
    try {
      const keywords = words.split('\n').map(word=>word.trim()).filter(Boolean);
      const result = await request('/highlights',{method:'PUT',body:JSON.stringify({...prefs,keywords})});
      setPrefs(result); setWords(result.keywords.join('\n')); setMessage('Saved. Click Highlight on current page in the extension to apply.');
    } catch(error) {setMessage(error.message);} finally {setSaving(false);}
  }
  return <><h3 id="keyword-highlights">Keyword highlights</h3><form className="panel highlight-editor" onSubmit={save}>
    {prefs ? <fieldset disabled={saving}>
      <label className="field">Keywords or phrases <small>Enter one per line.</small><textarea rows={4} value={words} onChange={e=>{setWords(e.target.value);setMessage('');}} placeholder={'React\nC++\nfully remote'}/></label>
      <div className="highlight-options">
        <label>Background <input type="color" value={prefs.background} onChange={e=>change('background',e.target.value)}/></label>
        <label>Text <input type="color" value={prefs.foreground} onChange={e=>change('foreground',e.target.value)}/></label>
        <label><input type="checkbox" checked={prefs.underline} onChange={e=>change('underline',e.target.checked)}/> Underline</label>
      </div>
      <p>Preview <mark style={{background:prefs.background,color:prefs.foreground,textDecoration:prefs.underline?'underline':'none'}}>{words.split('\n').find(s=>s.trim())||'Sample keyword'}</mark></p>
      <button className="outline-btn" type="submit">{saving?'Saving…':'Save highlights'}</button>
    </fieldset> : message ? <button type="button" className="outline-btn" onClick={()=>{setMessage('');retry(attempt+1);}}>Retry loading preferences</button> : 'Loading highlights…'}
    {message && <p role="status">{message}</p>}
  </form></>;
}
