import type { PreferredLanguage } from '../types/domain';
import { TA_EXACT_MAP, translateDynamicTamil } from './taDictionary';

export type NavKey =
  | 'admin-overview'
  | 'admin-owners'
  | 'admin-workspaces'
  | 'admin-tenants'
  | 'admin-wardens'
  | 'admin-payments'
  | 'admin-complaints'
  | 'admin-reports'
  | 'admin-notifications'
  | 'owner-overview'
  | 'owner-properties'
  | 'owner-rooms'
  | 'owner-tenants'
  | 'owner-rent'
  | 'owner-payments'
  | 'owner-wardens'
  | 'owner-complaints'
  | 'owner-notifications'
  | 'dashboard'
  | 'rooms'
  | 'guests'
  | 'stays'
  | 'payments'
  | 'expenses'
  | 'reminders'
  | 'reports'
  | 'settings';

const STRINGS: Record<PreferredLanguage, Record<string, string>> = {
  en: {
    'nav.admin-overview': 'Dashboard',
    'nav.admin-owners': 'PG Owners',
    'nav.admin-workspaces': 'PG Properties',
    'nav.admin-tenants': 'Tenants',
    'nav.admin-wardens': 'Staff',
    'nav.admin-payments': 'Payments & Rent',
    'nav.admin-complaints': 'Complaints',
    'nav.admin-reports': 'Reports',
    'nav.admin-notifications': 'Notifications',
    'nav.owner-overview': 'Dashboard',
    'nav.owner-properties': 'My Properties',
    'nav.owner-rooms': 'Rooms',
    'nav.owner-tenants': 'Tenants',
    'nav.owner-rent': 'Rent Collection',
    'nav.owner-payments': 'Payment History',
    'nav.owner-wardens': 'Staff Management',
    'nav.owner-complaints': 'Complaints',
    'nav.owner-notifications': 'Notifications',
    'nav.dashboard': 'Dashboard',
    'nav.rooms': 'Rooms & Beds',
    'nav.guests': 'Guests',
    'nav.stays': 'Stays',
    'nav.payments': 'Payments & Deposits',
    'nav.expenses': 'Expenses',
    'nav.reminders': 'Reminders',
    'nav.reports': 'Reports',
    'nav.settings': 'Settings',
    'dash.title': 'Daily Operations Overview',
    'dash.subtitle': 'Live PG occupancy, rent collections, security deposits held, and checkouts.',
    'action.addGuest': 'Add Guest',
    'action.checkIn': 'Check In',
    'action.recordPayment': 'Record Payment',
    'action.addRoom': 'Add Room',
    'kpi.currentResidents': 'Current Residents',
    'kpi.bedsOccupied': 'Beds Occupied / Available',
    'kpi.occupancyPct': 'Occupancy',
    'kpi.collectedPeriod': 'Collected in Period',
    'kpi.depositsHeld': 'Deposits Held',
    'kpi.unpaidCharges': 'Unpaid Charges',
    'kpi.upcomingCheckouts': 'Upcoming Checkouts',
    'kpi.overdueStays': 'Overdue Stays',
    'kpi.expensesPeriod': 'Expenses in Period',
    'common.searchGuests': 'Search guests by name, phone, room, or last 4 ID...',
    'common.signOut': 'Sign Out',
    'common.exportCsv': 'Export CSV',
    'common.printReceipt': 'Print Receipt',
    'compliance.notice':
      'Hostel operations software only — this application does not obtain licences or verify regulatory compliance.',
  },
  ta: {
    'nav.admin-overview': 'முகப்பு',
    'nav.admin-owners': 'PG உரிமையாளர்கள்',
    'nav.admin-workspaces': 'PG கிளைகள்',
    'nav.admin-tenants': 'தங்குபவர்கள்',
    'nav.admin-wardens': 'ஊழியர்கள்',
    'nav.admin-payments': 'கட்டணம் & வாடகை',
    'nav.admin-complaints': 'புகார்கள்',
    'nav.admin-reports': 'அறிக்கைகள்',
    'nav.admin-notifications': 'அறிவிப்புகள்',
    'nav.owner-overview': 'முகப்பு',
    'nav.owner-properties': 'என் PG கிளைகள்',
    'nav.owner-rooms': 'அறைகள்',
    'nav.owner-tenants': 'தங்குபவர்கள்',
    'nav.owner-rent': 'வாடகை வசூல்',
    'nav.owner-payments': 'கட்டண வரலாறு',
    'nav.owner-wardens': 'ஊழியர் மேலாண்மை',
    'nav.owner-complaints': 'புகார்கள்',
    'nav.owner-notifications': 'அறிவிப்புகள்',
    'nav.dashboard': 'முகப்பு',
    'nav.rooms': 'அறைகள் & படுக்கைகள்',
    'nav.guests': 'விருந்தினர்கள்',
    'nav.stays': 'தங்கல்கள்',
    'nav.payments': 'கட்டணம் & வைப்பு',
    'nav.expenses': 'செலவுகள்',
    'nav.reminders': 'நினைவூட்டல்கள்',
    'nav.reports': 'அறிக்கைகள்',
    'nav.settings': 'அமைப்புகள்',
    'dash.title': 'தினசரி விடுதி செயல்பாடுகள்',
    'dash.subtitle': 'தற்போதைய தங்குபவர்கள், படுக்கை இருப்பு, வாடகை வசூல் மற்றும் வைப்புத் தொகை.',
    'action.addGuest': 'விருந்தினர் சேர்',
    'action.checkIn': 'Check In செய்',
    'action.recordPayment': 'கட்டணம் பதிவு',
    'action.addRoom': 'புதிய அறை',
    'kpi.currentResidents': 'தற்போதைய தங்குபவர்கள்',
    'kpi.bedsOccupied': 'நிரம்பிய / காலி படுக்கைகள்',
    'kpi.occupancyPct': 'நிரம்பிய விகிதம்',
    'kpi.collectedPeriod': 'வசூலான வாடகை',
    'kpi.depositsHeld': 'வைப்புத் தொகை இருப்பு',
    'kpi.unpaidCharges': 'நிலுவை கட்டணம்',
    'kpi.upcomingCheckouts': 'வரவிருக்கும் Checkout',
    'kpi.overdueStays': 'தாமதமான தங்கல்கள்',
    'kpi.expensesPeriod': 'கால செலவுகள்',
    'common.searchGuests': 'பெயர், தொலைபேசி, அறை மூலம் தேடுக...',
    'common.signOut': 'வெளியேறு',
    'common.exportCsv': 'CSV பதிவிறக்கம்',
    'common.printReceipt': 'ரசீது அச்சிடு',
    'compliance.notice':
      'இது விடுதி மேலாண்மை மென்பொருள் மட்டுமே — அரசு உரிமங்கள் அல்லது சட்ட இணக்கத்தை சரிபார்க்கும் சேவை அல்ல.',
  },
};

export function t(lang: PreferredLanguage | undefined, key: string): string {
  const active = lang === 'ta' ? 'ta' : 'en';
  return STRINGS[active][key] || STRINGS.en[key] || key;
}

export function tr(lang: PreferredLanguage | undefined, englishText: string): string {
  if (lang !== 'ta') return englishText;
  return TA_EXACT_MAP[englishText] || translateDynamicTamil(englishText);
}
