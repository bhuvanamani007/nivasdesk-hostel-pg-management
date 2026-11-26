import { useEffect, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { api } from '../lib/api';
import { FACILITY_OPTIONS } from '../lib/format';
import { useLanguage } from '../lib/LanguageContext';
import {
  ROOM_TYPES,
  ROOM_TYPE_DEFAULT_CAPACITY,
  ROOM_TYPE_DEFAULT_TARIFF,
  type Room,
} from '../types/domain';

interface AddRoomModalProps {
  open: boolean;
  editingRoom?: Room | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddRoomModal({ open, editingRoom, onClose, onSuccess }: AddRoomModalProps) {
  const { tr } = useLanguage();
  const isEdit = Boolean(editingRoom);

  const [roomNumber, setRoomNumber] = useState('');
  const [floor, setFloor] = useState('1st Floor');
  const [roomType, setRoomType] = useState<Room['roomType']>('2-Sharing');
  const [capacity, setCapacity] = useState(2);
  const [bedCount, setBedCount] = useState(2);
  const [monthlyTariff, setMonthlyTariff] = useState(
    String(ROOM_TYPE_DEFAULT_TARIFF['2-Sharing'])
  );
  const [facilities, setFacilities] = useState<string[]>(['Wi-Fi', 'RO Water']);
  const [roomStatus, setRoomStatus] = useState<'available' | 'maintenance'>('available');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editingRoom) {
      setRoomNumber(editingRoom.roomNumber);
      setFloor(editingRoom.floor);
      setRoomType(editingRoom.roomType);
      setCapacity(editingRoom.capacity);
      setMonthlyTariff(String(editingRoom.monthlyTariff));
      setFacilities(editingRoom.facilities || []);
      setRoomStatus(editingRoom.status === 'maintenance' ? 'maintenance' : 'available');
    } else {
      setRoomNumber('');
      setFloor('1st Floor');
      setRoomType('2-Sharing');
      setCapacity(2);
      setBedCount(2);
      setMonthlyTariff(String(ROOM_TYPE_DEFAULT_TARIFF['2-Sharing']));
      setFacilities(['Wi-Fi', 'RO Water']);
      setRoomStatus('available');
    }
  }, [open, editingRoom]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const handleRoomTypeChange = (next: Room['roomType']) => {
    setRoomType(next);
    const defaultCap = ROOM_TYPE_DEFAULT_CAPACITY[next] ?? 4;
    const defaultTariff = ROOM_TYPE_DEFAULT_TARIFF[next] ?? 8500;
    setMonthlyTariff(String(defaultTariff));
    if (!isEdit) {
      setCapacity(defaultCap);
      setBedCount(defaultCap);
    }
  };

  const toggleFacility = (item: string) => {
    setFacilities((prev) =>
      prev.includes(item) ? prev.filter((f) => f !== item) : [...prev, item]
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!roomNumber.trim()) {
      setError(tr('Room number is required.'));
      return;
    }

    const fallbackTariff = ROOM_TYPE_DEFAULT_TARIFF[roomType] ?? 8500;
    setSubmitting(true);
    try {
      if (editingRoom) {
        await api.updateRoom(editingRoom.id, {
          roomNumber: roomNumber.trim(),
          floor: floor.trim() || '1st Floor',
          roomType,
          capacity: Math.max(1, capacity),
          monthlyTariff: Number(monthlyTariff) || fallbackTariff,
          facilities,
          status: roomStatus,
        });
      } else {
        const finalCap = Math.max(capacity, bedCount);
        await api.addRoom({
          roomNumber: roomNumber.trim(),
          floor: floor.trim() || '1st Floor',
          roomType,
          capacity: finalCap,
          bedCount: Math.min(bedCount, finalCap),
          monthlyTariff: Number(monthlyTariff) || fallbackTariff,
          facilities,
          status: roomStatus,
        });
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? tr(err.message) : tr('Failed to save room.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-room-title"
    >
      <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 id="add-room-title" className="typo-section-heading text-slate-900">
            {isEdit ? `${tr('Edit Room')} ${editingRoom?.roomNumber}` : tr('Add Room & Beds')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label={tr('Close room modal')}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 typo-body text-red-800">
              {tr(error)}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="room-num" className="block typo-label text-slate-700">
                {tr('Room Number')} <span className="text-red-600">*</span>
              </label>
              <input
                id="room-num"
                type="text"
                required
                value={roomNumber}
                onChange={(e) => setRoomNumber(e.target.value)}
                placeholder={tr('e.g., 301')}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input font-mono focus:border-teal-700 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="room-floor" className="block typo-label text-slate-700">
                {tr('Floor / Wing')}
              </label>
              <input
                id="room-floor"
                type="text"
                value={floor}
                onChange={(e) => setFloor(e.target.value)}
                placeholder={tr('1st Floor')}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="room-type" className="block typo-label text-slate-700">
                {tr('Room Type')}
              </label>
              <select
                id="room-type"
                value={roomType}
                onChange={(e) => handleRoomTypeChange(e.target.value as Room['roomType'])}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
              >
                {ROOM_TYPES.map((typeOption) => (
                  <option key={typeOption} value={typeOption}>
                    {tr(typeOption)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="room-cap" className="block typo-label text-slate-700">
                {tr('Max Bed Capacity')}
              </label>
              <input
                id="room-cap"
                type="number"
                min={1}
                max={30}
                value={capacity}
                onChange={(e) => {
                  const next = Math.min(30, Math.max(1, Number(e.target.value) || 1));
                  setCapacity(next);
                  if (!isEdit && bedCount > next) setBedCount(next);
                }}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input font-mono focus:border-teal-700 focus:outline-none"
              />
            </div>
            {!isEdit && (
              <div>
                <label htmlFor="room-beds" className="block typo-label text-slate-700">
                  {tr('Initial Beds')}
                </label>
                <input
                  id="room-beds"
                  type="number"
                  min={1}
                  max={capacity}
                  value={bedCount}
                  onChange={(e) => setBedCount(Number(e.target.value) || 1)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input font-mono focus:border-teal-700 focus:outline-none"
                />
              </div>
            )}
            {isEdit && (
              <div>
                <label htmlFor="room-status" className="block typo-label text-slate-700">
                  {tr('Room State')}
                </label>
                <select
                  id="room-status"
                  value={roomStatus}
                  onChange={(e) => setRoomStatus(e.target.value as 'available' | 'maintenance')}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                >
                  <option value="available">{tr('Available / Normal')}</option>
                  <option value="maintenance">{tr('Under Maintenance')}</option>
                </select>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="room-tariff" className="block typo-label text-slate-700">
                {tr('Monthly Bed Rent / Tariff (₹)')}
              </label>
              {Number(monthlyTariff) !== ROOM_TYPE_DEFAULT_TARIFF[roomType] && (
                <button
                  type="button"
                  onClick={() => setMonthlyTariff(String(ROOM_TYPE_DEFAULT_TARIFF[roomType]))}
                  className="typo-helper font-medium text-teal-700 hover:text-teal-800 hover:underline"
                >
                  {tr('Reset to')} ₹{ROOM_TYPE_DEFAULT_TARIFF[roomType].toLocaleString('en-IN')}
                </button>
              )}
            </div>
            <input
              id="room-tariff"
              type="number"
              min={500}
              value={monthlyTariff}
              onChange={(e) => setMonthlyTariff(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input font-mono focus:border-teal-700 focus:outline-none"
            />
            <p className="mt-1 typo-helper text-slate-500">
              {tr('Auto-set from')} {tr(roomType)} {tr('rate')} (₹
              {ROOM_TYPE_DEFAULT_TARIFF[roomType].toLocaleString('en-IN')}/{tr('bed')}). {tr('You can adjust this rate if needed.')}
            </p>
          </div>

          <div>
            <p className="block typo-label text-slate-700 mb-2">{tr('Room Facilities')}</p>
            <div className="grid grid-cols-2 gap-2">
              {FACILITY_OPTIONS.map((fac) => (
                <label
                  key={fac}
                  className="flex items-center gap-2 rounded border border-slate-200 px-2.5 py-1.5 typo-body text-slate-700 cursor-pointer hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={facilities.includes(fac)}
                    onChange={() => toggleFacility(fac)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-teal-700"
                  />
                  <span>{tr(fac)}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="min-h-10 rounded-md border border-slate-300 bg-white px-4 py-2 typo-btn text-slate-700 hover:bg-slate-50"
            >
              {tr('Cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-10 rounded-md bg-teal-700 px-5 py-2 typo-btn text-white hover:bg-teal-800 disabled:opacity-50"
            >
              {submitting ? tr('Saving...') : isEdit ? tr('Save Changes') : tr('Create Room')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
