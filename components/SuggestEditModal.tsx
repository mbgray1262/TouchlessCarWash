'use client';

import { useState } from 'react';
import { Pencil, X, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ISSUE_TYPES = [
  { value: 'permanently_closed', label: 'Permanently closed' },
  { value: 'not_touchless', label: 'Not actually touchless' },
  { value: 'wrong_address', label: 'Wrong address' },
  { value: 'wrong_phone', label: 'Wrong phone number' },
  { value: 'wrong_hours', label: 'Wrong hours' },
  { value: 'wrong_website', label: 'Wrong website' },
  { value: 'other', label: 'Other' },
] as const;

type IssueType = (typeof ISSUE_TYPES)[number]['value'];

interface SuggestEditModalProps {
  listingId: string;
  listingName: string;
}

export default function SuggestEditModal({ listingId, listingName }: SuggestEditModalProps) {
  const [open, setOpen] = useState(false);
  const [issueType, setIssueType] = useState<IssueType | ''>('');
  const [details, setDetails] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  function handleOpen() {
    setOpen(true);
    setSubmitted(false);
    setError('');
    setIssueType('');
    setDetails('');
    setEmail('');
  }

  function handleClose() {
    setOpen(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!issueType) {
      setError('Please select an issue type.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/suggest-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listingId, issue_type: issueType, details, email }),
      });
      if (res.status === 429) {
        setError("You've reached the daily limit for suggestions. Try again tomorrow.");
        return;
      }
      if (!res.ok) {
        setError('Something went wrong. Please try again.');
        return;
      }
      setSubmitted(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors mt-3"
      >
        <Pencil className="w-3 h-3" />
        Suggest an edit
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-[#0F2744]">Suggest an Edit</h2>
                <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">{listingName}</p>
              </div>
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5">
              {submitted ? (
                <div className="flex flex-col items-center text-center gap-3 py-6">
                  <CheckCircle className="w-12 h-12 text-[#22C55E]" />
                  <p className="text-base font-semibold text-[#0F2744]">Thank you!</p>
                  <p className="text-sm text-gray-500">We'll review your suggestion and update the listing if needed.</p>
                  <Button
                    onClick={handleClose}
                    variant="outline"
                    size="sm"
                    className="mt-2"
                  >
                    Close
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <fieldset>
                    <legend className="text-sm font-medium text-[#0F2744] mb-3">What's the issue?</legend>
                    <div className="space-y-2">
                      {ISSUE_TYPES.map(({ value, label }) => (
                        <label
                          key={value}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                            issueType === value
                              ? 'border-[#0F2744] bg-[#0F2744]/5'
                              : 'border-gray-200 hover:border-gray-300 bg-white'
                          }`}
                        >
                          <input
                            type="radio"
                            name="issue_type"
                            value={value}
                            checked={issueType === value}
                            onChange={() => setIssueType(value)}
                            className="accent-[#0F2744]"
                          />
                          <span className="text-sm text-gray-700">{label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <div>
                    <label className="block text-sm font-medium text-[#0F2744] mb-1.5">
                      Details <span className="font-normal text-gray-400">(optional)</span>
                    </label>
                    <textarea
                      value={details}
                      onChange={(e) => setDetails(e.target.value)}
                      placeholder="Tell us more..."
                      rows={3}
                      maxLength={1000}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-[#0F2744]/20 focus:border-[#0F2744] placeholder-gray-400 text-gray-700"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#0F2744] mb-1.5">
                      Your email <span className="font-normal text-gray-400">(optional)</span>
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="In case we need to follow up"
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#0F2744]/20 focus:border-[#0F2744] placeholder-gray-400 text-gray-700"
                    />
                  </div>

                  {error && (
                    <p className="text-sm text-red-600">{error}</p>
                  )}

                  <div className="flex gap-3 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={handleClose}
                      disabled={submitting}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1 bg-[#0F2744] hover:bg-[#1E3A8A] text-white"
                      disabled={submitting}
                    >
                      {submitting ? 'Sending...' : 'Submit'}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
