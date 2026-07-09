import React, { useState, useEffect } from 'react';
import api from '../lib/api.js';
import {
  Plus,
  ArrowRight,
  UserCheck,
  Play
} from 'lucide-react';

export default function ApprovalsPage() {
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [instances, setInstances] = useState<any[]>([]);
  const [myQueue, setMyQueue] = useState<any[]>([]);
  
  // Form states
  const [name, setName] = useState('');
  const [approverEmail, setApproverEmail] = useState('');
  
  // Submit approvals form
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [selectedDocId, setSelectedDocId] = useState('');
  const [documents, setDocuments] = useState<any[]>([]);

  const loadApprovalsData = async () => {
    try {
      const wfRes = await api.get('/approvals/workflows');
      setWorkflows(wfRes.data.data || []);
      if (wfRes.data.data?.length > 0) {
        setSelectedWorkflowId(wfRes.data.data[0]._id);
      }

      const qRes = await api.get('/approvals/instances/queue');
      setMyQueue(qRes.data.data || []);

      // Get all instances
      const allRes = await api.get('/approvals/instances/all');
      setInstances(allRes.data.data || []);

      // Get matters to list documents
      const matRes = await api.get('/matters');
      const matters = matRes.data.data || [];
      const docsList: any[] = [];
      for (const m of matters) {
        const docRes = await api.get(`/matters/${m._id}/documents`);
        docsList.push(...(docRes.data.documents || []));
      }
      setDocuments(docsList);
      if (docsList.length > 0) {
        setSelectedDocId(docsList[0]._id);
      }
    } catch (err) {
      console.warn('Failed to load approvals context:', err);
    }
  };

  useEffect(() => {
    loadApprovalsData();
  }, []);

  const handleCreateWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !approverEmail) return;

    try {
      // Create a simple 1-step workflow
      await api.post('/approvals/workflows', {
        name,
        steps: [
          { order: 1, approverEmail, role: 'approver' },
        ],
      });
      setName('');
      setApproverEmail('');
      loadApprovalsData();
      alert('Approval workflow registered successfully.');
    } catch (err) {
      alert('Failed to register workflow.');
    }
  };

  const handleStartInstance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkflowId || !selectedDocId) return;

    try {
      await api.post('/approvals/instances', {
        workflowId: selectedWorkflowId,
        contractId: selectedDocId,
      });
      loadApprovalsData();
      alert('Approval request submitted successfully!');
    } catch (err) {
      alert('Failed to trigger approval instance.');
    }
  };

  const handleDecideStep = async (id: string, decision: 'approve' | 'reject') => {
    const comment = window.prompt(`Add a comment for this ${decision} decision:`);
    if (comment === null) return; // cancel

    try {
      await api.post(`/approvals/instances/${id}/${decision}`, { comment });
      loadApprovalsData();
      alert(`Approval step registered: ${decision}`);
    } catch (err) {
      alert('Failed to submit approval decision.');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Approval Workflows</h1>
        <p className="text-sm text-slate-500 mt-1">Configure multi-step signoff routing and approve pending contract operations</p>
      </div>

      {/* Grid splits */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Col: Setup and Start Forms */}
        <div className="flex flex-col gap-6">
          {/* Create Workflow Definition */}
          <div className="glass-panel bg-white border border-slate-200 shadow-sm rounded-xl p-6 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2">Register Route</h3>
            <form onSubmit={handleCreateWorkflow} className="flex flex-col gap-4 text-xs">
              <div className="flex flex-col gap-1">
                <label className="text-slate-400 font-medium">Route Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Finance Execution Workflow"
                  className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2"
                  required
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-slate-400 font-medium">Step 1 Approver Email</label>
                <input
                  type="email"
                  value={approverEmail}
                  onChange={(e) => setApproverEmail(e.target.value)}
                  placeholder="cfo@company.com"
                  className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2"
                  required
                />
              </div>
              <button type="submit" className="w-full btn-primary justify-center py-2 rounded-lg font-semibold flex items-center gap-1">
                <Plus size={14} /> Save Route
              </button>
            </form>
          </div>

          {/* Trigger Workflow Instance */}
          <div className="glass-panel bg-white border border-slate-200 shadow-sm rounded-xl p-6 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2">Start Approval</h3>
            <form onSubmit={handleStartInstance} className="flex flex-col gap-4 text-xs">
              <div className="flex flex-col gap-1">
                <label className="text-slate-400 font-medium">Select Route</label>
                <select
                  value={selectedWorkflowId}
                  onChange={(e) => setSelectedWorkflowId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2"
                >
                  {workflows.map((w) => (
                    <option key={w._id} value={w._id}>{w.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-slate-400 font-medium">Select Contract</label>
                <select
                  value={selectedDocId}
                  onChange={(e) => setSelectedDocId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2"
                >
                  {documents.map((d) => (
                    <option key={d._id} value={d._id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <button type="submit" className="w-full btn-primary justify-center py-2 rounded-lg font-semibold flex items-center gap-1">
                <Play size={14} /> Submit Request
              </button>
            </form>
          </div>
        </div>

        {/* Right Col: My queue and all instances */}
        <div className="md:col-span-2 flex flex-col gap-6">
          {/* My Pending Queue */}
          <div className="glass-panel bg-white border border-slate-200 shadow-sm rounded-xl p-6 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-2">
              <UserCheck size={16} className="text-emerald-500" /> Assigned to Me
            </h3>
            <div className="flex flex-col gap-3">
              {myQueue.map((inst) => (
                <div key={inst._id} className="p-4 border border-slate-100 rounded-lg flex justify-between items-center bg-slate-50/20">
                  <div>
                    <h4 className="text-sm font-bold text-slate-700">{inst.contract?.title || 'Contract'}</h4>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Submitted: {new Date(inst.submittedAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDecideStep(inst._id, 'approve')}
                      className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleDecideStep(inst._id, 'reject')}
                      className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
                    >
                      Reject
                    </button>
                    <button
                      onClick={async () => {
                        const email = window.prompt('Enter new approver email:');
                        if (!email) return;
                        try {
                          await api.post(`/approvals/instances/${inst._id}/delegate`, { newApproverEmail: email });
                          loadApprovalsData();
                          alert(`Delegated successfully to ${email}`);
                        } catch {
                          alert('Failed to delegate approval request.');
                        }
                      }}
                      className="px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50 text-slate-600 text-xs font-semibold"
                    >
                      Delegate
                    </button>
                  </div>
                </div>
              ))}
              {myQueue.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-6">No approvals assigned to your queue.</p>
              )}
            </div>
          </div>

          {/* Tracking Queue */}
          <div className="glass-panel bg-white border border-slate-200 shadow-sm rounded-xl p-6 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2">Active Approvals Timeline</h3>
            <div className="flex flex-col gap-3">
              {instances.map((inst) => (
                <div key={inst._id} className="p-4 border border-slate-100 rounded-lg flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-slate-700">{inst.contract?.title || 'Contract'}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                        inst.status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
                        inst.status === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {inst.status}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {inst.steps.map((st: any, idx: number) => (
                      <div key={idx} className="flex items-center">
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            st.status === 'approved' ? 'bg-emerald-500 text-white' :
                            st.status === 'rejected' ? 'bg-red-500 text-white' : 'bg-slate-200 text-slate-600'
                          }`}
                          title={`Approver: ${st.approverEmail} (${st.status})`}
                        >
                          {st.order}
                        </div>
                        {idx < inst.steps.length - 1 && <ArrowRight size={10} className="mx-1 text-slate-300" />}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {instances.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-6">No approvals submitted in organization.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
