'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

// ── TYPES ──────────────────────────────────────────────────
type Project = { id: string; name: string; description: string; color: string; created_at: string; };
type ColKey = 'planning' | 'next' | 'inprogress' | 'done';
type Task = { id: string; project_id: string; title: string; column_name: ColKey; deadline: string | null; priority: string | null; notes: string | null; position: number; created_at: string; };
type AIIdea = { id: string; title: string; description: string; created_at: string; project_ids: string[]; };

// ── CONSTANTS ──────────────────────────────────────────────
const COLS: { key: ColKey; label: string; accent: string; moveTo: ColKey | null; moveLabel: string | null }[] = [
  { key: 'planning',   label: 'Under Planning',   accent: '#48B5EA', moveTo: 'next',        moveLabel: '→ Next'        },
  { key: 'next',       label: 'Going to Do Next',  accent: '#F9B62A', moveTo: 'inprogress',  moveLabel: '→ In Progress' },
  { key: 'inprogress', label: 'In Progress',        accent: '#20BB71', moveTo: 'done',        moveLabel: '→ Done'        },
  { key: 'done',       label: 'Done',               accent: '#6B6B6B', moveTo: null,          moveLabel: null            },
];

const PROJECT_COLORS = ['#20BB71','#48B5EA','#F9B62A','#F53619','#F64674','#111111','#8B5CF6','#06B6D4','#84CC16','#EC4899'];

// ── HELPERS ────────────────────────────────────────────────
function dlInfo(dl: string | null) {
  if (!dl) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(dl + 'T00:00:00');
  const diff = Math.ceil((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0)   return { c: '#F53619', t: `Overdue ${Math.abs(diff)}d` };
  if (diff === 0) return { c: '#F53619', t: 'Due today' };
  if (diff <= 3)  return { c: '#F9B62A', t: `Due in ${diff}d` };
  return { c: '#20BB71', t: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) };
}

// ── INLINE STYLE HELPERS ───────────────────────────────────
const S = {
  page:    { fontFamily: "'DM Sans', sans-serif", background: '#FAFAFA', minHeight: '100vh', display: 'flex', flexDirection: 'column' as const },
  topbar:  { background: '#111', height: 50, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 14, flexShrink: 0, position: 'sticky' as const, top: 0, zIndex: 50 },
  tlogo:   { fontSize: 19, fontWeight: 400, letterSpacing: '-0.03em', color: '#fff' },
  tdiv:    { width: 1, height: 16, background: 'rgba(255,255,255,.18)' },
  tlbl:    { fontFamily: "'Barlow', 'DM Sans', sans-serif", fontSize: 10, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,.4)' },
  body:    { display: 'flex', flex: 1, overflow: 'hidden', height: 'calc(100vh - 50px)' },
  sidebar: { width: 220, flexShrink: 0, borderRight: '1px solid #E6E6E6', background: '#fff', padding: '18px 0', display: 'flex', flexDirection: 'column' as const, overflowY: 'auto' as const },
  sbSec:   { padding: '0 12px', marginBottom: 18 },
  sbLbl:   { fontFamily: "'Barlow','DM Sans',sans-serif", fontSize: 9, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: '#6B6B6B', padding: '0 5px', marginBottom: 6, display: 'block' },
  main:    { flex: 1, padding: '28px 32px', overflowY: 'auto' as const, minWidth: 0 },
  ph:      { marginBottom: 22, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' as const },
  phPre:   { fontFamily: "'Barlow','DM Sans',sans-serif", fontSize: 10, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#20BB71', marginBottom: 5 },
  phTitle: { fontSize: 32, fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1.05, display: 'flex', alignItems: 'center', gap: 12 },
  phSub:   { marginTop: 5, fontSize: 13, color: '#6B6B6B' },
};

const btn = (variant: 'solid'|'accent'|'ghost'|'danger', sm?: boolean) => ({
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
  fontSize: sm ? 11 : 12, padding: sm ? '5px 10px' : '7px 14px',
  border: '1px solid',
  borderColor: variant === 'accent' ? '#20BB71' : variant === 'danger' ? '#E6E6E6' : '#111',
  background: variant === 'solid' ? '#111' : variant === 'accent' ? '#20BB71' : 'transparent',
  color: variant === 'solid' || variant === 'accent' ? '#fff' : variant === 'danger' ? '#6B6B6B' : '#111',
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, lineHeight: 1, whiteSpace: 'nowrap' as const,
});

const tag = (variant: ColKey | 'crit' | 'high') => {
  const map = {
    planning:   { bg: '#E1F7FF', border: '#E1F7FF', color: '#1a6d9b' },
    next:       { bg: '#FFEECA', border: '#FFEECA', color: '#7a5200' },
    inprogress: { bg: '#C2FFE2', border: '#C2FFE2', color: '#0e6d3f' },
    done:       { bg: '#F0F0F0', border: '#E6E6E6', color: '#6B6B6B' },
    crit:       { bg: '#F53619', border: '#F53619', color: '#fff' },
    high:       { bg: '#F9B62A', border: '#F9B62A', color: '#111' },
  };
  const m = map[variant];
  return { fontFamily: "'Barlow','DM Sans',sans-serif", fontSize: 8, fontWeight: 600 as const, letterSpacing: '0.1em', textTransform: 'uppercase' as const, padding: '3px 6px', border: `1px solid ${m.border}`, background: m.bg, color: m.color, display: 'inline-flex', alignItems: 'center', gap: 3 };
};

// ── MAIN PAGE ──────────────────────────────────────────────
export default function TrackerPage() {
  const [authLoading, setAuthLoading]   = useState(true);
  const [projects, setProjects]         = useState<Project[]>([]);
  const [tasks, setTasks]               = useState<Task[]>([]);
  const [aiIdeas, setAiIdeas]           = useState<AIIdea[]>([]);
  const [view, setView]                 = useState<string | null>(null);
  const [toastMsg, setToastMsg]         = useState('');
  const toastRef                        = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modal open/close + form data bundled together
  const [projModal, setProjModal]       = useState(false);
  const [taskModal, setTaskModal]       = useState<{ open: boolean; editing?: Task }>({ open: false });
  const [aiModal, setAiModal]           = useState(false);

  // Form fields
  const [fProjName, setFProjName]       = useState('');
  const [fProjDesc, setFProjDesc]       = useState('');
  const [fProjColor, setFProjColor]     = useState(PROJECT_COLORS[0]);

  const [fTitle, setFTitle]             = useState('');
  const [fProject, setFProject]         = useState('');
  const [fCol, setFCol]                 = useState<ColKey>('planning');
  const [fDeadline, setFDeadline]       = useState('');
  const [fPriority, setFPriority]       = useState('');
  const [fNotes, setFNotes]             = useState('');

  const [fAiTitle, setFAiTitle]         = useState('');
  const [fAiDesc, setFAiDesc]           = useState('');
  const [fAiProjs, setFAiProjs]         = useState<string[]>([]);

  // ── AUTH ──────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { window.location.href = '/login'; return; }
      setAuthLoading(false);
    });
  }, []);

  // ── LOAD DATA ─────────────────────────────────────────────
  const loadData = useCallback(async () => {
    const [{ data: p }, { data: t }, { data: a }] = await Promise.all([
      supabase.from('tracker_projects').select('*').order('created_at', { ascending: true }),
      supabase.from('tracker_tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('tracker_ai_ideas')
        .select('*, tracker_ai_idea_projects(project_id)')
        .order('created_at', { ascending: false }),
    ]);
    if (p) { setProjects(p); setView(v => v ?? (p[0]?.id ?? null)); }
    if (t) setTasks(t);
    if (a) setAiIdeas(a.map(i => ({ ...i, project_ids: (i.tracker_ai_idea_projects ?? []).map((x: any) => x.project_id) })));
  }, []);

  // ── REALTIME ─────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    loadData();
    const ch = supabase.channel('tracker-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tracker_projects' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tracker_tasks' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tracker_ai_ideas' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tracker_ai_idea_projects' }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [authLoading, loadData]);

  // ── TOAST ─────────────────────────────────────────────────
  const toast = (msg: string) => {
    setToastMsg(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToastMsg(''), 2500);
  };

  // ── PROJECT CRUD ──────────────────────────────────────────
  async function createProject() {
    if (!fProjName.trim()) return;
    const { data } = await supabase.from('tracker_projects')
      .insert({ name: fProjName.trim(), description: fProjDesc, color: fProjColor })
      .select().single();
    setProjModal(false); setFProjName(''); setFProjDesc(''); setFProjColor(PROJECT_COLORS[0]);
    if (data) setView(data.id);
    toast('Project created');
  }

  async function deleteProject(id: string) {
    if (!confirm('Delete this project and all its tasks? This cannot be undone.')) return;
    await supabase.from('tracker_projects').delete().eq('id', id);
    setView(projects.filter(p => p.id !== id)[0]?.id ?? null);
    toast('Project deleted');
  }

  // ── TASK CRUD ─────────────────────────────────────────────
  function openAddTask(pid?: string, col?: ColKey) {
    setFTitle(''); setFDeadline(''); setFPriority(''); setFNotes('');
    setFProject(pid || projects[0]?.id || '');
    setFCol(col || 'planning');
    setTaskModal({ open: true });
  }

  function openEditTask(task: Task) {
    setFTitle(task.title); setFProject(task.project_id); setFCol(task.column_name);
    setFDeadline(task.deadline || ''); setFPriority(task.priority || ''); setFNotes(task.notes || '');
    setTaskModal({ open: true, editing: task });
  }

  async function saveTask() {
    if (!fTitle.trim() || !fProject) return;
    const payload = { title: fTitle.trim(), project_id: fProject, column_name: fCol, deadline: fDeadline || null, priority: fPriority || null, notes: fNotes || null };
    if (taskModal.editing) {
      await supabase.from('tracker_tasks').update(payload).eq('id', taskModal.editing.id);
      toast('Task updated');
    } else {
      await supabase.from('tracker_tasks').insert(payload);
      toast('Task added');
    }
    setTaskModal({ open: false });
    setView(fProject);
  }

  async function moveTask(id: string, newCol: ColKey) {
    await supabase.from('tracker_tasks').update({ column_name: newCol }).eq('id', id);
    toast('Moved → ' + COLS.find(c => c.key === newCol)?.label);
  }

  async function deleteTask(id: string) {
    if (!confirm('Delete this task?')) return;
    await supabase.from('tracker_tasks').delete().eq('id', id);
    toast('Task deleted');
  }

  // ── AI IDEAS CRUD ─────────────────────────────────────────
  async function saveAIIdea() {
    if (!fAiTitle.trim()) return;
    const { data: idea } = await supabase.from('tracker_ai_ideas')
      .insert({ title: fAiTitle.trim(), description: fAiDesc || 'AI integration idea' })
      .select().single();
    if (idea && fAiProjs.length > 0) {
      await supabase.from('tracker_ai_idea_projects')
        .insert(fAiProjs.map(pid => ({ idea_id: idea.id, project_id: pid })));
    }
    setAiModal(false); setFAiTitle(''); setFAiDesc(''); setFAiProjs([]);
    toast('AI idea added');
  }

  async function deleteAIIdea(id: string) {
    if (!confirm('Delete this idea?')) return;
    await supabase.from('tracker_ai_ideas').delete().eq('id', id);
    toast('Idea deleted');
  }

  // ── COMPUTED ──────────────────────────────────────────────
  const proj = projects.find(p => p.id === view);
  const projTasks = (pid: string) => tasks.filter(t => t.project_id === pid);

  // ── LOADING ───────────────────────────────────────────────
  if (authLoading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAFAFA', fontFamily: "'DM Sans',sans-serif", color: '#6B6B6B', fontSize: 14 }}>
      Loading…
    </div>
  );

  // ── RENDER ────────────────────────────────────────────────
  return (
    <div style={S.page}>
      {/* ── TOPBAR ── */}
      <div style={S.topbar}>
        <span style={S.tlogo}>alloy</span>
        <div style={S.tdiv} />
        <span style={S.tlbl}>P360 Project Tracker</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button style={{ ...btn('ghost', true), borderColor: 'rgba(255,255,255,.2)', color: 'rgba(255,255,255,.65)' }} onClick={() => setProjModal(true)}>+ New Project</button>
          <button style={btn('accent', true)} onClick={() => openAddTask()}>+ Add Task</button>
        </div>
      </div>

      <div style={S.body}>
        {/* ── SIDEBAR ── */}
        <div style={S.sidebar}>
          <div style={S.sbSec}>
            <span style={S.sbLbl}>Projects</span>
            {projects.map(p => {
              const tot = projTasks(p.id).length;
              const dn  = projTasks(p.id).filter(t => t.column_name === 'done').length;
              const on  = view === p.id;
              return (
                <div key={p.id} onClick={() => setView(p.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', border: `1px solid ${on ? '#111' : 'transparent'}`, background: on ? '#111' : 'transparent', marginBottom: 2, cursor: 'pointer' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                  <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 500, color: on ? '#fff' : '#111', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  <span style={{ fontFamily: "'Barlow',sans-serif", fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', background: on ? 'rgba(255,255,255,.15)' : '#F0F0F0', color: on ? '#fff' : '#6B6B6B', padding: '2px 6px' }}>{dn}/{tot}</span>
                </div>
              );
            })}
            <button style={{ ...btn('ghost', true), marginTop: 8, width: '100%', justifyContent: 'center' }} onClick={() => setProjModal(true)}>+ New Project</button>
          </div>

          <div style={{ marginTop: 'auto', padding: '0 12px', borderTop: '1px solid #E6E6E6', paddingTop: 16 }}>
            <span style={S.sbLbl}>Global</span>
            <div onClick={() => setView('ai')} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', border: `1px solid ${view === 'ai' ? '#F64674' : 'transparent'}`, background: view === 'ai' ? '#F64674' : 'transparent', cursor: 'pointer' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#F64674', flexShrink: 0 }} />
              <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 500, color: view === 'ai' ? '#fff' : '#111', flex: 1 }}>AI Integration Ideas</span>
              <span style={{ fontFamily: "'Barlow',sans-serif", fontSize: 9, fontWeight: 600, background: view === 'ai' ? 'rgba(255,255,255,.2)' : '#FFCFDC', color: view === 'ai' ? '#fff' : '#8b1a3a', padding: '2px 6px' }}>{aiIdeas.length}</span>
            </div>
          </div>
        </div>

        {/* ── MAIN ── */}
        <div style={S.main}>
          {!view && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 360, textAlign: 'center' }}>
              <div style={{ fontSize: 26, fontWeight: 400, letterSpacing: '-0.01em', marginBottom: 8 }}>Welcome to P360 Tracker</div>
              <div style={{ fontSize: 14, color: '#6B6B6B', marginBottom: 24 }}>Create a project to get started</div>
              <button style={btn('accent')} onClick={() => setProjModal(true)}>+ Create your first project</button>
            </div>
          )}

          {/* ── AI IDEAS VIEW ── */}
          {view === 'ai' && (
            <>
              <div style={S.ph}>
                <div>
                  <p style={S.phPre}>Global · Shared across all projects</p>
                  <h1 style={S.phTitle}>AI Integration Ideas</h1>
                  <p style={S.phSub}>Future AI features — link them to any project</p>
                </div>
                <button style={btn('accent')} onClick={() => setAiModal(true)}>+ Add AI Idea</button>
              </div>
              <div style={{ border: '1px solid #E6E6E6', background: '#fff' }}>
                <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid #E6E6E6', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 3, height: 16, background: '#F64674' }} />
                  <span style={{ fontFamily: "'Barlow',sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }}>AI Ideas — {aiIdeas.length} total</span>
                </div>
                {aiIdeas.length === 0 && (
                  <div style={{ padding: 48, textAlign: 'center', color: '#6B6B6B', fontSize: 13 }}>No AI ideas yet. Add one above.</div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
                  {aiIdeas.map(idea => {
                    const linked = projects.filter(p => idea.project_ids.includes(p.id));
                    return (
                      <div key={idea.id} style={{ padding: '16px 18px', borderRight: '1px solid #E6E6E6', borderBottom: '1px solid #E6E6E6', position: 'relative' }}>
                        <div style={{ fontFamily: "'Barlow',sans-serif", fontSize: 8, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#F64674', marginBottom: 6 }}>AI Feature Idea</div>
                        <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4, marginBottom: 5 }}>{idea.title}</div>
                        <div style={{ fontSize: 11, color: '#6B6B6B', lineHeight: 1.5, marginBottom: 10 }}>{idea.description}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {linked.length > 0 ? linked.map(p => (
                            <span key={p.id} style={{ fontFamily: "'Barlow',sans-serif", fontSize: 8, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 6px', border: `1px solid ${p.color}40`, background: `${p.color}15`, color: p.color }}>{p.name}</span>
                          )) : <span style={{ ...tag('done') }}>No project linked</span>}
                        </div>
                        <button onClick={() => deleteAIIdea(idea.id)} style={{ ...btn('danger', true), position: 'absolute', top: 10, right: 10, opacity: 0.6, padding: '3px 6px' }} title="Delete">✕</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* ── PROJECT BOARD ── */}
          {view && view !== 'ai' && proj && (() => {
            const pts = projTasks(proj.id);
            const total = pts.length;
            const done  = pts.filter(t => t.column_name === 'done').length;
            const pct   = total ? Math.round((done / total) * 100) : 0;
            return (
              <>
                <div style={S.ph}>
                  <div>
                    <p style={S.phPre}>Project Tracker</p>
                    <h1 style={S.phTitle}>
                      <span style={{ display: 'inline-block', width: 8, height: 32, background: proj.color, flexShrink: 0 }} />
                      {proj.name}
                    </h1>
                    {proj.description && <p style={S.phSub}>{proj.description}</p>}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={btn('ghost', true)} onClick={() => deleteProject(proj.id)}>Delete project</button>
                    <button style={btn('solid', true)} onClick={() => openAddTask(proj.id, 'planning')}>+ Add Task</button>
                  </div>
                </div>

                {/* Stats + progress */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 22, flexWrap: 'wrap' }}>
                  {[
                    { b: '#20BB71', n: done,                                           l: 'Done'        },
                    { b: '#20BB71', n: pts.filter(t=>t.column_name==='inprogress').length, l: 'In Progress' },
                    { b: '#F9B62A', n: pts.filter(t=>t.column_name==='next').length,       l: 'Up Next'     },
                    { b: '#48B5EA', n: pts.filter(t=>t.column_name==='planning').length,   l: 'Planning'    },
                  ].map(s => (
                    <div key={s.l} style={{ flex: 1, minWidth: 80, background: '#fff', border: '1px solid #E6E6E6', padding: '12px 16px' }}>
                      <div style={{ height: 2, width: 20, background: s.b, marginBottom: 7 }} />
                      <div style={{ fontSize: 26, fontWeight: 400, letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 3 }}>{s.n}</div>
                      <div style={{ fontFamily: "'Barlow',sans-serif", fontSize: 9, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6B6B6B' }}>{s.l}</div>
                    </div>
                  ))}
                  <div style={{ background: '#fff', border: '1px solid #E6E6E6', padding: '12px 16px', minWidth: 160 }}>
                    <div style={{ fontFamily: "'Barlow',sans-serif", fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6B6B6B', marginBottom: 6 }}>Progress</div>
                    <div style={{ height: 3, background: '#F0F0F0', marginBottom: 5 }}>
                      <div style={{ height: '100%', background: '#20BB71', width: `${pct}%`, transition: 'width 400ms ease' }} />
                    </div>
                    <div style={{ fontFamily: "'Barlow',sans-serif", fontSize: 9, letterSpacing: '0.08em', color: '#6B6B6B' }}>{pct}% · {done}/{total} done</div>
                  </div>
                </div>

                {/* Board */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14, alignItems: 'start' }}>
                  {COLS.map(col => {
                    const colTasks = pts.filter(t => t.column_name === col.key);
                    return (
                      <div key={col.key} style={{ background: '#fff', border: '1px solid #E6E6E6' }}>
                        <div style={{ padding: '11px 14px 9px', borderBottom: '1px solid #E6E6E6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <div style={{ width: 3, height: 14, background: col.accent, flexShrink: 0 }} />
                            <span style={{ fontFamily: "'Barlow',sans-serif", fontSize: 9, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{col.label}</span>
                          </div>
                          <span style={{ fontFamily: "'Barlow',sans-serif", fontSize: 9, fontWeight: 500, letterSpacing: '0.06em', color: '#6B6B6B', background: '#F0F0F0', padding: '1px 6px' }}>{colTasks.length}</span>
                        </div>
                        <div style={{ padding: 10, minHeight: 200, display: 'flex', flexDirection: 'column', gap: 7 }}>
                          {colTasks.length === 0 && (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120, border: '1px dashed #E6E6E6' }}>
                              <span style={{ fontFamily: "'Barlow',sans-serif", fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#E6E6E6' }}>Empty</span>
                            </div>
                          )}
                          {colTasks.map(task => {
                            const dl = dlInfo(task.deadline);
                            const tagVariant: ColKey | 'crit' | 'high' = task.priority === 'Critical' ? 'crit' : task.priority === 'High' ? 'high' : col.key;
                            const tagLbl = task.priority === 'Critical' ? 'Critical' : task.priority === 'High' ? 'High' : col.key === 'done' ? 'Done' : col.key === 'inprogress' ? 'Active' : col.key === 'next' ? 'Up next' : 'Planned';
                            return (
                              <div key={task.id} style={{ border: '1px solid #E6E6E6', background: '#fff', padding: '10px 12px', transition: 'box-shadow 0.18s, transform 0.18s' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(0,0,0,.1)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; (e.currentTarget as HTMLDivElement).style.transform = 'none'; }}>
                                <div style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.4, marginBottom: 6 }}>{task.title}</div>
                                {task.notes && <div style={{ fontSize: 11, color: '#6B6B6B', lineHeight: 1.4, marginBottom: 5 }}>{task.notes}</div>}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 7, alignItems: 'center' }}>
                                  <span style={tag(tagVariant)}><span style={{ width: 3, height: 3, borderRadius: '50%', background: 'currentColor', opacity: 0.7 }} />{tagLbl}</span>
                                  {dl && <span style={{ fontFamily: "'Barlow',sans-serif", fontSize: 8, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: dl.c, display: 'inline-flex', alignItems: 'center', gap: 3 }}>{dl.t}</span>}
                                </div>
                                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                  <button style={{ ...btn('ghost', true), padding: '3px 7px', fontSize: 11 }} onClick={() => openEditTask(task)} title="Edit">✎</button>
                                  {col.moveTo && <button style={{ background: '#111', border: '1px solid #111', color: '#fff', padding: '3px 7px', cursor: 'pointer', fontSize: 10, fontFamily: "'DM Sans',sans-serif", whiteSpace: 'nowrap' }} onClick={() => moveTask(task.id, col.moveTo!)}>{col.moveLabel}</button>}
                                  <button style={{ ...btn('danger', true), padding: '3px 7px', fontSize: 11 }} onClick={() => deleteTask(task.id)} title="Delete">✕</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* ── TOAST ── */}
      <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: `translateX(-50%) translateY(${toastMsg ? 0 : 60}px)`, background: '#111', color: '#fff', fontFamily: "'Barlow',sans-serif", fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '9px 18px', zIndex: 300, transition: 'transform 240ms ease, opacity 240ms', opacity: toastMsg ? 1 : 0, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
        {toastMsg}
      </div>

      {/* ── MODAL: NEW PROJECT ── */}
      {projModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={e => { if (e.target === e.currentTarget) setProjModal(false); }}>
          <div style={{ background: '#fff', border: '1px solid #E6E6E6', padding: 28, width: 440, maxWidth: '90vw', boxShadow: '0 6px 18px rgba(0,0,0,.08)' }}>
            <div style={{ fontSize: 20, fontWeight: 400, letterSpacing: '-0.01em', marginBottom: 3 }}>New Project</div>
            <div style={{ fontSize: 12, color: '#6B6B6B', marginBottom: 20 }}>Create a project with its own board</div>
            <MField label="Project Name"><input value={fProjName} onChange={e => setFProjName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createProject()} placeholder="e.g. P360 Dashboard Builder" autoFocus style={iStyle} /></MField>
            <MField label="Description (optional)"><textarea value={fProjDesc} onChange={e => setFProjDesc(e.target.value)} rows={2} placeholder="What is this project?" style={{ ...iStyle, resize: 'none' }} /></MField>
            <MField label="Color">
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 4 }}>
                {PROJECT_COLORS.map(c => (
                  <div key={c} onClick={() => setFProjColor(c)} style={{ width: 26, height: 26, background: c, cursor: 'pointer', border: `2px solid ${fProjColor === c ? '#111' : 'transparent'}`, transition: 'transform 0.15s', transform: fProjColor === c ? 'scale(1.15)' : 'scale(1)' }} />
                ))}
              </div>
            </MField>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18, paddingTop: 16, borderTop: '1px solid #E6E6E6' }}>
              <button style={btn('ghost', true)} onClick={() => setProjModal(false)}>Cancel</button>
              <button style={btn('accent', true)} onClick={createProject}>Create Project</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: ADD / EDIT TASK ── */}
      {taskModal.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={e => { if (e.target === e.currentTarget) setTaskModal({ open: false }); }}>
          <div style={{ background: '#fff', border: '1px solid #E6E6E6', padding: 28, width: 480, maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 6px 18px rgba(0,0,0,.08)' }}>
            <div style={{ fontSize: 20, fontWeight: 400, letterSpacing: '-0.01em', marginBottom: 3 }}>{taskModal.editing ? 'Edit Task' : 'Add Task'}</div>
            <div style={{ fontSize: 12, color: '#6B6B6B', marginBottom: 20 }}>Fill in the details below</div>
            <MField label="Task Title"><input value={fTitle} onChange={e => setFTitle(e.target.value)} placeholder="e.g. Build drag-and-drop canvas" autoFocus style={iStyle} /></MField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <MField label="Project">
                <select value={fProject} onChange={e => setFProject(e.target.value)} style={iStyle}>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </MField>
              <MField label="Column">
                <select value={fCol} onChange={e => setFCol(e.target.value as ColKey)} style={iStyle}>
                  {COLS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </MField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <MField label="Deadline"><input type="date" value={fDeadline} onChange={e => setFDeadline(e.target.value)} style={iStyle} /></MField>
              <MField label="Priority">
                <select value={fPriority} onChange={e => setFPriority(e.target.value)} style={iStyle}>
                  <option value="">— None —</option>
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                </select>
              </MField>
            </div>
            <MField label="Notes (optional)"><textarea value={fNotes} onChange={e => setFNotes(e.target.value)} rows={2} placeholder="Any extra details…" style={{ ...iStyle, resize: 'none' }} /></MField>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18, paddingTop: 16, borderTop: '1px solid #E6E6E6' }}>
              <button style={btn('ghost', true)} onClick={() => setTaskModal({ open: false })}>Cancel</button>
              <button style={btn('accent', true)} onClick={saveTask}>{taskModal.editing ? 'Save Changes' : 'Add Task'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: AI IDEA ── */}
      {aiModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={e => { if (e.target === e.currentTarget) setAiModal(false); }}>
          <div style={{ background: '#fff', border: '1px solid #E6E6E6', padding: 28, width: 460, maxWidth: '90vw', boxShadow: '0 6px 18px rgba(0,0,0,.08)' }}>
            <div style={{ fontSize: 20, fontWeight: 400, letterSpacing: '-0.01em', marginBottom: 3 }}>Add AI Idea</div>
            <div style={{ fontSize: 12, color: '#6B6B6B', marginBottom: 20 }}>Log a future AI integration concept</div>
            <MField label="Idea Title"><input value={fAiTitle} onChange={e => setFAiTitle(e.target.value)} placeholder="e.g. Smart Recommendations Engine" autoFocus style={iStyle} /></MField>
            <MField label="Description"><textarea value={fAiDesc} onChange={e => setFAiDesc(e.target.value)} rows={3} placeholder="What does this AI feature do?" style={{ ...iStyle, resize: 'none' }} /></MField>
            <MField label="Link to Projects (optional)">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                {projects.map(p => (
                  <label key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
                    <input type="checkbox" checked={fAiProjs.includes(p.id)} onChange={e => setFAiProjs(prev => e.target.checked ? [...prev, p.id] : prev.filter(x => x !== p.id))} />
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} />
                    {p.name}
                  </label>
                ))}
              </div>
            </MField>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18, paddingTop: 16, borderTop: '1px solid #E6E6E6' }}>
              <button style={btn('ghost', true)} onClick={() => setAiModal(false)}>Cancel</button>
              <button style={btn('accent', true)} onClick={saveAIIdea}>Add Idea</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SMALL HELPER COMPONENTS ────────────────────────────────
const iStyle: React.CSSProperties = { width: '100%', fontFamily: "'DM Sans',sans-serif", fontSize: 13, padding: '8px 11px', border: '1px solid #E6E6E6', background: '#fff', color: '#111', outline: 'none' };

function MField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontFamily: "'Barlow','DM Sans',sans-serif", fontSize: 9, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6B6B6B', display: 'block', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}
