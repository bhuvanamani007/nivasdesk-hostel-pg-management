import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Download, Eye, FileText, Lock, Search, Trash2, Upload, X } from 'lucide-react';
import { api } from '../lib/api';
import { formatBytes, formatDateShort, ID_TYPE_LABELS } from '../lib/format';
import { useLanguage } from '../lib/LanguageContext';
import type {
  DocumentRole,
  EnrichedDocument,
  Guest,
  IdDocumentType,
  PaginationMeta,
  UserRole,
} from '../types/domain';
import { ConfirmDialog } from './ConfirmDialog';
import { Pagination } from './Pagination';

interface DocumentsViewProps {
  refreshKey: number;
  userRole: UserRole;
  guestOptions: Guest[];
  previewDoc: EnrichedDocument | null;
  onSetPreviewDoc: (doc: EnrichedDocument | null) => void;
  onDataChanged: () => void;
}

const DEFAULT_PAGINATION: PaginationMeta = {
  page: 1,
  pageSize: 8,
  totalItems: 0,
  totalPages: 1,
  hasNextPage: false,
  hasPrevPage: false,
};

export function DocumentsView({
  refreshKey,
  userRole,
  guestOptions,
  previewDoc,
  onSetPreviewDoc,
  onDataChanged,
}: DocumentsViewProps) {
  const { tr } = useLanguage();
  const canDeleteDoc = userRole === 'owner' || userRole === 'overall_admin';

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [idTypeFilter, setIdTypeFilter] = useState<'all' | IdDocumentType>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);

  const [documents, setDocuments] = useState<EnrichedDocument[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>(DEFAULT_PAGINATION);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [guestId, setGuestId] = useState('');
  const [idType, setIdType] = useState<IdDocumentType>('aadhaar');
  const [docRole, setDocRole] = useState<DocumentRole>('id_front');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const [docToDelete, setDocToDelete] = useState<EnrichedDocument | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    api
      .getDocuments(
        {
          page,
          pageSize,
          search: debouncedQuery || undefined,
          idType: idTypeFilter,
        },
        controller.signal
      )
      .then((res) => {
        setDocuments(res.documents);
        setPagination(res.pagination);
        if (res.pagination.page !== page) {
          setPage(res.pagination.page);
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? tr(err.message) : tr('Failed to load documents.'));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [page, pageSize, debouncedQuery, idTypeFilter, refreshKey, reloadTick]);

  const handleRetry = useCallback(() => {
    setReloadTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!previewDoc) {
      setPreviewBlobUrl(null);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    setPreviewBlobUrl(null);
    setPreviewError(null);
    api
      .fetchDocumentBlobUrl(previewDoc.id)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        createdUrl = url;
        setPreviewBlobUrl(url);
      })
      .catch((err) => {
        if (!cancelled) {
          setPreviewError(err instanceof Error ? tr(err.message) : tr('Preview unavailable.'));
        }
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [previewDoc]);

  const handleUpload = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const chosenGuestId = guestId || guestOptions[0]?.id;
    if (!chosenGuestId || !file) {
      setError(tr('Please choose a guest and select a document file.'));
      return;
    }

    const fd = new FormData();
    fd.append('guestId', chosenGuestId);
    fd.append('idType', idType);
    fd.append('docRole', docRole);
    fd.append('file', file);

    setUploading(true);
    try {
      await api.uploadDocument(fd);
      setFile(null);
      setUploadOpen(false);
      setPage(1);
      onDataChanged();
    } catch (err) {
      setError(err instanceof Error ? tr(err.message) : tr('Upload failed.'));
    } finally {
      setUploading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!docToDelete) return;
    setDeleteBusy(true);
    try {
      await api.deleteDocument(docToDelete.id);
      setDocToDelete(null);
      onDataChanged();
    } catch (err) {
      setError(err instanceof Error ? tr(err.message) : tr('Delete failed.'));
      setDocToDelete(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-1.5 typo-body text-slate-600">
          <Lock className="h-3.5 w-3.5 text-teal-700" aria-hidden="true" />
          <span>
            {tr('Optional private ID document attachments · Opaque object keys · Authenticated downloads only.')}
          </span>
        </p>

        <button
          type="button"
          onClick={() => {
            if (!guestId && guestOptions[0]) setGuestId(guestOptions[0].id);
            setUploadOpen(true);
          }}
          className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 py-1.5 typo-btn text-slate-700 hover:bg-slate-50 whitespace-nowrap"
        >
          <Upload className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{tr('Upload ID Document')}</span>
        </button>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3 typo-body text-red-800">
          <span>{tr(error)}</span>
          <button
            type="button"
            onClick={handleRetry}
            className="ml-4 rounded border border-red-300 bg-white px-3 py-1 typo-btn text-red-800 hover:bg-red-100"
          >
            {tr('Retry')}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder={tr('Search guest, document type, filename...')}
            aria-label={tr('Search identity documents')}
            className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 typo-input focus:border-teal-700 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-white p-1 w-fit">
          {(
            [
              { id: 'all', label: 'All Types' },
              { id: 'aadhaar', label: 'Aadhaar' },
              { id: 'passport', label: 'Passport' },
              { id: 'driving_licence', label: 'Driving Licence' },
              { id: 'voter_id', label: 'Voter ID' },
              { id: 'other', label: 'Other' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setIdTypeFilter(item.id);
                setPage(1);
              }}
              className={`rounded px-3 py-1.5 typo-btn transition-colors whitespace-nowrap ${
                idTypeFilter === item.id
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {tr(item.label)}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {loading && documents.length === 0 ? (
          <div className="p-8 text-center typo-body text-slate-500">{tr('Loading documents...')}</div>
        ) : documents.length === 0 ? (
          <div className="p-10 text-center">
            <p className="typo-body font-medium text-slate-700">{tr('No documents found.')}</p>
          </div>
        ) : (
          <div className={`overflow-x-auto ${loading ? 'opacity-60 transition-opacity' : ''}`}>
            <table className="w-full text-left typo-table-td">
              <thead className="border-b border-slate-200 bg-slate-50 typo-table-th text-slate-600">
                <tr>
                  <th className="px-5 py-3">{tr('Guest')}</th>
                  <th className="px-4 py-3">{tr('ID Type & Role')}</th>
                  <th className="px-4 py-3">{tr('Masked ID')}</th>
                  <th className="px-4 py-3">{tr('File & Size')}</th>
                  <th className="px-4 py-3">{tr('Uploaded')}</th>
                  <th className="px-5 py-3 text-right">{tr('Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50/80">
                    <td className="px-5 py-3 font-medium text-slate-900">{doc.guestName}</td>
                    <td className="px-4 py-3 typo-table-td text-slate-700">
                      {tr(ID_TYPE_LABELS[doc.idType])} · {tr(doc.docRole.replace('_', ' '))}
                    </td>
                    <td className="px-4 py-3 font-mono typo-table-td text-slate-600">
                      {doc.guestIdMasked || '—'}
                    </td>
                    <td className="px-4 py-3 typo-table-td text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-slate-400" />
                        <span className="truncate max-w-44">{doc.originalFileName}</span>
                        <span className="typo-helper text-slate-400 tabular-nums">
                          ({formatBytes(doc.sizeBytes)})
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 typo-table-td text-slate-600 tabular-nums whitespace-nowrap">
                      {formatDateShort(doc.uploadedAt)}
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onSetPreviewDoc(doc)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 typo-btn text-slate-700 hover:bg-slate-50"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>{tr('Preview')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            api.downloadDocument(doc.id, doc.originalFileName).catch((err) =>
                              setError(err instanceof Error ? tr(err.message) : tr('Download failed.'))
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 typo-btn text-slate-700 hover:bg-slate-50"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>{tr('Download')}</span>
                        </button>
                        {canDeleteDoc && (
                          <button
                            type="button"
                            onClick={() => setDocToDelete(doc)}
                            aria-label={`${tr('Delete')} ${doc.originalFileName}`}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          pagination={pagination}
          onPageChange={setPage}
          onPageSizeChange={(nextSize) => {
            setPageSize(nextSize);
            setPage(1);
          }}
          pageSizeOptions={[8, 15, 30]}
          itemLabel={tr('documents')}
        />
      </div>

      {/* Upload Document Modal */}
      {uploadOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={tr('Upload identity document')}
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="typo-section-heading text-slate-900">{tr('Upload ID Document')}</h2>
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleUpload} className="space-y-4 px-6 py-5">
              <div>
                <label htmlFor="doc-guest" className="block typo-label text-slate-700">
                  {tr('Guest')}
                </label>
                <select
                  id="doc-guest"
                  value={guestId}
                  onChange={(e) => setGuestId(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input"
                >
                  {guestOptions.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.fullName} ({g.primaryPhone})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="doc-idtype" className="block typo-label text-slate-700">
                    {tr('Document Type')}
                  </label>
                  <select
                    id="doc-idtype"
                    value={idType}
                    onChange={(e) => setIdType(e.target.value as IdDocumentType)}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input"
                  >
                    <option value="aadhaar">{tr('Aadhaar')}</option>
                    <option value="passport">{tr('Passport')}</option>
                    <option value="driving_licence">{tr('Driving Licence')}</option>
                    <option value="voter_id">{tr('Voter ID')}</option>
                    <option value="other">{tr('Other')}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="doc-role" className="block typo-label text-slate-700">
                    {tr('Side / Role')}
                  </label>
                  <select
                    id="doc-role"
                    value={docRole}
                    onChange={(e) => setDocRole(e.target.value as DocumentRole)}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input"
                  >
                    <option value="id_front">{tr('ID Front')}</option>
                    <option value="id_back">{tr('ID Back')}</option>
                    <option value="additional_id">{tr('Additional ID')}</option>
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="doc-file" className="block typo-label text-slate-700">
                  {tr('File (JPEG, PNG, WebP, or PDF, max 5 MB)')}
                </label>
                <input
                  id="doc-file"
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.pdf"
                  required
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="mt-1 block w-full typo-helper text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
                />
              </div>
              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setUploadOpen(false)}
                  className="min-h-10 rounded-md border border-slate-300 px-4 py-2 typo-btn text-slate-700"
                >
                  {tr('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={uploading || guestOptions.length === 0}
                  className="min-h-10 rounded-md bg-teal-700 px-4 py-2 typo-btn text-white hover:bg-teal-800 disabled:opacity-50"
                >
                  {uploading ? tr('Uploading...') : tr('Upload')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Authenticated Preview Modal */}
      {previewDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={tr('Document preview')}
        >
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="typo-section-heading text-slate-900">
                  {previewDoc.guestName} · {tr(ID_TYPE_LABELS[previewDoc.idType])}
                </h2>
                <p className="typo-helper text-slate-500">
                  {previewDoc.originalFileName} · {tr('Key')} {previewDoc.objectKey.slice(0, 8)}…
                </p>
              </div>
              <button
                type="button"
                onClick={() => onSetPreviewDoc(null)}
                aria-label={tr('Close document preview')}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-slate-100 p-4 flex items-center justify-center">
              {previewError ? (
                <p className="typo-body text-red-700">{tr(previewError)}</p>
              ) : !previewBlobUrl ? (
                <p className="typo-body text-slate-500">{tr('Loading document preview...')}</p>
              ) : previewDoc.mimeType === 'application/pdf' ? (
                <iframe
                  title={previewDoc.originalFileName}
                  src={previewBlobUrl}
                  className="h-[65vh] w-full rounded border border-slate-200 bg-white"
                />
              ) : (
                <img
                  src={previewBlobUrl}
                  alt={`${previewDoc.guestName} ${tr(ID_TYPE_LABELS[previewDoc.idType])}`}
                  className="max-h-[65vh] rounded border border-slate-200 bg-white object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(docToDelete)}
        title={tr('Delete Identity Document?')}
        description={tr(`Remove "${docToDelete?.originalFileName || ''}" from private object storage?`)}
        confirmLabel={tr('Delete Document')}
        destructive
        busy={deleteBusy}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDocToDelete(null)}
      />
    </div>
  );
}
