import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, ChevronDown, ChevronUp, AlertCircle, RefreshCw } from 'lucide-react';
import PublicNav from '../components/PublicNav';
import api from '../services/apiClient';
import { getPostAuthRedirect } from '../utils/postAuthRedirect';

// ── Country codes ─────────────────────────────────────────────────────────────
const COUNTRY_CODES = [
  { code: 'AF', dial: '+93', flag: '🇦🇫', name: 'Afghanistan' },
  { code: 'AL', dial: '+355', flag: '🇦🇱', name: 'Albania' },
  { code: 'DZ', dial: '+213', flag: '🇩🇿', name: 'Algeria' },
  { code: 'AD', dial: '+376', flag: '🇦🇩', name: 'Andorra' },
  { code: 'AO', dial: '+244', flag: '🇦🇴', name: 'Angola' },
  { code: 'AG', dial: '+1268', flag: '🇦🇬', name: 'Antigua and Barbuda' },
  { code: 'AR', dial: '+54', flag: '🇦🇷', name: 'Argentina' },
  { code: 'AM', dial: '+374', flag: '🇦🇲', name: 'Armenia' },
  { code: 'AU', dial: '+61', flag: '🇦🇺', name: 'Australia' },
  { code: 'AT', dial: '+43', flag: '🇦🇹', name: 'Austria' },
  { code: 'AZ', dial: '+994', flag: '🇦🇿', name: 'Azerbaijan' },
  { code: 'BS', dial: '+1242', flag: '🇧🇸', name: 'Bahamas' },
  { code: 'BH', dial: '+973', flag: '🇧🇭', name: 'Bahrain' },
  { code: 'BD', dial: '+880', flag: '🇧🇩', name: 'Bangladesh' },
  { code: 'BB', dial: '+1246', flag: '🇧🇧', name: 'Barbados' },
  { code: 'BY', dial: '+375', flag: '🇧🇾', name: 'Belarus' },
  { code: 'BE', dial: '+32', flag: '🇧🇪', name: 'Belgium' },
  { code: 'BZ', dial: '+501', flag: '🇧🇿', name: 'Belize' },
  { code: 'BJ', dial: '+229', flag: '🇧🇯', name: 'Benin' },
  { code: 'BT', dial: '+975', flag: '🇧🇹', name: 'Bhutan' },
  { code: 'BO', dial: '+591', flag: '🇧🇴', name: 'Bolivia' },
  { code: 'BA', dial: '+387', flag: '🇧🇦', name: 'Bosnia and Herzegovina' },
  { code: 'BW', dial: '+267', flag: '🇧🇼', name: 'Botswana' },
  { code: 'BR', dial: '+55', flag: '🇧🇷', name: 'Brazil' },
  { code: 'BN', dial: '+673', flag: '🇧🇳', name: 'Brunei' },
  { code: 'BG', dial: '+359', flag: '🇧🇬', name: 'Bulgaria' },
  { code: 'BF', dial: '+226', flag: '🇧🇫', name: 'Burkina Faso' },
  { code: 'BI', dial: '+257', flag: '🇧🇮', name: 'Burundi' },
  { code: 'KH', dial: '+855', flag: '🇰🇭', name: 'Cambodia' },
  { code: 'CM', dial: '+237', flag: '🇨🇲', name: 'Cameroon' },
  { code: 'CA', dial: '+1', flag: '🇨🇦', name: 'Canada' },
  { code: 'CV', dial: '+238', flag: '🇨🇻', name: 'Cape Verde' },
  { code: 'CF', dial: '+236', flag: '🇨🇫', name: 'Central African Republic' },
  { code: 'TD', dial: '+235', flag: '🇹🇩', name: 'Chad' },
  { code: 'CL', dial: '+56', flag: '🇨🇱', name: 'Chile' },
  { code: 'CN', dial: '+86', flag: '🇨🇳', name: 'China' },
  { code: 'CO', dial: '+57', flag: '🇨🇴', name: 'Colombia' },
  { code: 'KM', dial: '+269', flag: '🇰🇲', name: 'Comoros' },
  { code: 'CG', dial: '+242', flag: '🇨🇬', name: 'Congo' },
  { code: 'CD', dial: '+243', flag: '🇨🇩', name: 'Congo (DRC)' },
  { code: 'CR', dial: '+506', flag: '🇨🇷', name: 'Costa Rica' },
  { code: 'HR', dial: '+385', flag: '🇭🇷', name: 'Croatia' },
  { code: 'CU', dial: '+53', flag: '🇨🇺', name: 'Cuba' },
  { code: 'CY', dial: '+357', flag: '🇨🇾', name: 'Cyprus' },
  { code: 'CZ', dial: '+420', flag: '🇨🇿', name: 'Czech Republic' },
  { code: 'CI', dial: '+225', flag: '🇨🇮', name: 'Côte d\'Ivoire' },
  { code: 'DK', dial: '+45', flag: '🇩🇰', name: 'Denmark' },
  { code: 'DJ', dial: '+253', flag: '🇩🇯', name: 'Djibouti' },
  { code: 'DM', dial: '+1767', flag: '🇩🇲', name: 'Dominica' },
  { code: 'DO', dial: '+1809', flag: '🇩🇴', name: 'Dominican Republic' },
  { code: 'EC', dial: '+593', flag: '🇪🇨', name: 'Ecuador' },
  { code: 'EG', dial: '+20', flag: '🇪🇬', name: 'Egypt' },
  { code: 'SV', dial: '+503', flag: '🇸🇻', name: 'El Salvador' },
  { code: 'GQ', dial: '+240', flag: '🇬🇶', name: 'Equatorial Guinea' },
  { code: 'ER', dial: '+291', flag: '🇪🇷', name: 'Eritrea' },
  { code: 'EE', dial: '+372', flag: '🇪🇪', name: 'Estonia' },
  { code: 'SZ', dial: '+268', flag: '🇸🇿', name: 'Eswatini' },
  { code: 'ET', dial: '+251', flag: '🇪🇹', name: 'Ethiopia' },
  { code: 'FJ', dial: '+679', flag: '🇫🇯', name: 'Fiji' },
  { code: 'FI', dial: '+358', flag: '🇫🇮', name: 'Finland' },
  { code: 'FR', dial: '+33', flag: '🇫🇷', name: 'France' },
  { code: 'GA', dial: '+241', flag: '🇬🇦', name: 'Gabon' },
  { code: 'GM', dial: '+220', flag: '🇬🇲', name: 'Gambia' },
  { code: 'GE', dial: '+995', flag: '🇬🇪', name: 'Georgia' },
  { code: 'DE', dial: '+49', flag: '🇩🇪', name: 'Germany' },
  { code: 'GH', dial: '+233', flag: '🇬🇭', name: 'Ghana' },
  { code: 'GR', dial: '+30', flag: '🇬🇷', name: 'Greece' },
  { code: 'GD', dial: '+1473', flag: '🇬🇩', name: 'Grenada' },
  { code: 'GT', dial: '+502', flag: '🇬🇹', name: 'Guatemala' },
  { code: 'GN', dial: '+224', flag: '🇬🇳', name: 'Guinea' },
  { code: 'GW', dial: '+245', flag: '🇬🇼', name: 'Guinea-Bissau' },
  { code: 'GY', dial: '+592', flag: '🇬🇾', name: 'Guyana' },
  { code: 'HT', dial: '+509', flag: '🇭🇹', name: 'Haiti' },
  { code: 'HN', dial: '+504', flag: '🇭🇳', name: 'Honduras' },
  { code: 'HK', dial: '+852', flag: '🇭🇰', name: 'Hong Kong' },
  { code: 'HU', dial: '+36', flag: '🇭🇺', name: 'Hungary' },
  { code: 'IS', dial: '+354', flag: '🇮🇸', name: 'Iceland' },
  { code: 'IN', dial: '+91', flag: '🇮🇳', name: 'India' },
  { code: 'ID', dial: '+62', flag: '🇮🇩', name: 'Indonesia' },
  { code: 'IR', dial: '+98', flag: '🇮🇷', name: 'Iran' },
  { code: 'IQ', dial: '+964', flag: '🇮🇶', name: 'Iraq' },
  { code: 'IE', dial: '+353', flag: '🇮🇪', name: 'Ireland' },
  { code: 'IL', dial: '+972', flag: '🇮🇱', name: 'Israel' },
  { code: 'IT', dial: '+39', flag: '🇮🇹', name: 'Italy' },
  { code: 'JM', dial: '+1876', flag: '🇯🇲', name: 'Jamaica' },
  { code: 'JP', dial: '+81', flag: '🇯🇵', name: 'Japan' },
  { code: 'JO', dial: '+962', flag: '🇯🇴', name: 'Jordan' },
  { code: 'KZ', dial: '+7', flag: '🇰🇿', name: 'Kazakhstan' },
  { code: 'KE', dial: '+254', flag: '🇰🇪', name: 'Kenya' },
  { code: 'KI', dial: '+686', flag: '🇰🇮', name: 'Kiribati' },
  { code: 'KW', dial: '+965', flag: '🇰🇼', name: 'Kuwait' },
  { code: 'KG', dial: '+996', flag: '🇰🇬', name: 'Kyrgyzstan' },
  { code: 'LA', dial: '+856', flag: '🇱🇦', name: 'Laos' },
  { code: 'LV', dial: '+371', flag: '🇱🇻', name: 'Latvia' },
  { code: 'LB', dial: '+961', flag: '🇱🇧', name: 'Lebanon' },
  { code: 'LS', dial: '+266', flag: '🇱🇸', name: 'Lesotho' },
  { code: 'LR', dial: '+231', flag: '🇱🇷', name: 'Liberia' },
  { code: 'LY', dial: '+218', flag: '🇱🇾', name: 'Libya' },
  { code: 'LI', dial: '+423', flag: '🇱🇮', name: 'Liechtenstein' },
  { code: 'LT', dial: '+370', flag: '🇱🇹', name: 'Lithuania' },
  { code: 'LU', dial: '+352', flag: '🇱🇺', name: 'Luxembourg' },
  { code: 'MO', dial: '+853', flag: '🇲🇴', name: 'Macau' },
  { code: 'MG', dial: '+261', flag: '🇲🇬', name: 'Madagascar' },
  { code: 'MW', dial: '+265', flag: '🇲🇼', name: 'Malawi' },
  { code: 'MY', dial: '+60', flag: '🇲🇾', name: 'Malaysia' },
  { code: 'MV', dial: '+960', flag: '🇲🇻', name: 'Maldives' },
  { code: 'ML', dial: '+223', flag: '🇲🇱', name: 'Mali' },
  { code: 'MT', dial: '+356', flag: '🇲🇹', name: 'Malta' },
  { code: 'MR', dial: '+222', flag: '🇲🇷', name: 'Mauritania' },
  { code: 'MU', dial: '+230', flag: '🇲🇺', name: 'Mauritius' },
  { code: 'MX', dial: '+52', flag: '🇲🇽', name: 'Mexico' },
  { code: 'MD', dial: '+373', flag: '🇲🇩', name: 'Moldova' },
  { code: 'MC', dial: '+377', flag: '🇲🇨', name: 'Monaco' },
  { code: 'MN', dial: '+976', flag: '🇲🇳', name: 'Mongolia' },
  { code: 'ME', dial: '+382', flag: '🇲🇪', name: 'Montenegro' },
  { code: 'MA', dial: '+212', flag: '🇲🇦', name: 'Morocco' },
  { code: 'MZ', dial: '+258', flag: '🇲🇿', name: 'Mozambique' },
  { code: 'MM', dial: '+95', flag: '🇲🇲', name: 'Myanmar' },
  { code: 'NA', dial: '+264', flag: '🇳🇦', name: 'Namibia' },
  { code: 'NP', dial: '+977', flag: '🇳🇵', name: 'Nepal' },
  { code: 'NL', dial: '+31', flag: '🇳🇱', name: 'Netherlands' },
  { code: 'NZ', dial: '+64', flag: '🇳🇿', name: 'New Zealand' },
  { code: 'NI', dial: '+505', flag: '🇳🇮', name: 'Nicaragua' },
  { code: 'NE', dial: '+227', flag: '🇳🇪', name: 'Niger' },
  { code: 'NG', dial: '+234', flag: '🇳🇬', name: 'Nigeria' },
  { code: 'MK', dial: '+389', flag: '🇲🇰', name: 'North Macedonia' },
  { code: 'NO', dial: '+47', flag: '🇳🇴', name: 'Norway' },
  { code: 'OM', dial: '+968', flag: '🇴🇲', name: 'Oman' },
  { code: 'PK', dial: '+92', flag: '🇵🇰', name: 'Pakistan' },
  { code: 'PA', dial: '+507', flag: '🇵🇦', name: 'Panama' },
  { code: 'PG', dial: '+675', flag: '🇵🇬', name: 'Papua New Guinea' },
  { code: 'PY', dial: '+595', flag: '🇵🇾', name: 'Paraguay' },
  { code: 'PE', dial: '+51', flag: '🇵🇪', name: 'Peru' },
  { code: 'PH', dial: '+63', flag: '🇵🇭', name: 'Philippines' },
  { code: 'PL', dial: '+48', flag: '🇵🇱', name: 'Poland' },
  { code: 'PT', dial: '+351', flag: '🇵🇹', name: 'Portugal' },
  { code: 'QA', dial: '+974', flag: '🇶🇦', name: 'Qatar' },
  { code: 'RO', dial: '+40', flag: '🇷🇴', name: 'Romania' },
  { code: 'RU', dial: '+7', flag: '🇷🇺', name: 'Russia' },
  { code: 'RW', dial: '+250', flag: '🇷🇼', name: 'Rwanda' },
  { code: 'KN', dial: '+1869', flag: '🇰🇳', name: 'Saint Kitts and Nevis' },
  { code: 'LC', dial: '+1758', flag: '🇱🇨', name: 'Saint Lucia' },
  { code: 'VC', dial: '+1784', flag: '🇻🇨', name: 'Saint Vincent and the Grenadines' },
  { code: 'WS', dial: '+685', flag: '🇼🇸', name: 'Samoa' },
  { code: 'SM', dial: '+378', flag: '🇸🇲', name: 'San Marino' },
  { code: 'SA', dial: '+966', flag: '🇸🇦', name: 'Saudi Arabia' },
  { code: 'SN', dial: '+221', flag: '🇸🇳', name: 'Senegal' },
  { code: 'RS', dial: '+381', flag: '🇷🇸', name: 'Serbia' },
  { code: 'SC', dial: '+248', flag: '🇸🇨', name: 'Seychelles' },
  { code: 'SL', dial: '+232', flag: '🇸🇱', name: 'Sierra Leone' },
  { code: 'SG', dial: '+65', flag: '🇸🇬', name: 'Singapore' },
  { code: 'SK', dial: '+421', flag: '🇸🇰', name: 'Slovakia' },
  { code: 'SI', dial: '+386', flag: '🇸🇮', name: 'Slovenia' },
  { code: 'SB', dial: '+677', flag: '🇸🇧', name: 'Solomon Islands' },
  { code: 'SO', dial: '+252', flag: '🇸🇴', name: 'Somalia' },
  { code: 'ZA', dial: '+27', flag: '🇿🇦', name: 'South Africa' },
  { code: 'KR', dial: '+82', flag: '🇰🇷', name: 'South Korea' },
  { code: 'SS', dial: '+211', flag: '🇸🇸', name: 'South Sudan' },
  { code: 'ES', dial: '+34', flag: '🇪🇸', name: 'Spain' },
  { code: 'LK', dial: '+94', flag: '🇱🇰', name: 'Sri Lanka' },
  { code: 'SD', dial: '+249', flag: '🇸🇩', name: 'Sudan' },
  { code: 'SR', dial: '+597', flag: '🇸🇷', name: 'Suriname' },
  { code: 'SE', dial: '+46', flag: '🇸🇪', name: 'Sweden' },
  { code: 'CH', dial: '+41', flag: '🇨🇭', name: 'Switzerland' },
  { code: 'SY', dial: '+963', flag: '🇸🇾', name: 'Syria' },
  { code: 'ST', dial: '+239', flag: '🇸🇹', name: 'São Tomé and Príncipe' },
  { code: 'TW', dial: '+886', flag: '🇹🇼', name: 'Taiwan' },
  { code: 'TJ', dial: '+992', flag: '🇹🇯', name: 'Tajikistan' },
  { code: 'TZ', dial: '+255', flag: '🇹🇿', name: 'Tanzania' },
  { code: 'TH', dial: '+66', flag: '🇹🇭', name: 'Thailand' },
  { code: 'TL', dial: '+670', flag: '🇹🇱', name: 'Timor-Leste' },
  { code: 'TG', dial: '+228', flag: '🇹🇬', name: 'Togo' },
  { code: 'TO', dial: '+676', flag: '🇹🇴', name: 'Tonga' },
  { code: 'TT', dial: '+1868', flag: '🇹🇹', name: 'Trinidad and Tobago' },
  { code: 'TN', dial: '+216', flag: '🇹🇳', name: 'Tunisia' },
  { code: 'TR', dial: '+90', flag: '🇹🇷', name: 'Turkey' },
  { code: 'TM', dial: '+993', flag: '🇹🇲', name: 'Turkmenistan' },
  { code: 'TV', dial: '+688', flag: '🇹🇻', name: 'Tuvalu' },
  { code: 'UG', dial: '+256', flag: '🇺🇬', name: 'Uganda' },
  { code: 'UA', dial: '+380', flag: '🇺🇦', name: 'Ukraine' },
  { code: 'AE', dial: '+971', flag: '🇦🇪', name: 'United Arab Emirates' },
  { code: 'GB', dial: '+44', flag: '🇬🇧', name: 'United Kingdom' },
  { code: 'US', dial: '+1', flag: '🇺🇸', name: 'United States' },
  { code: 'UY', dial: '+598', flag: '🇺🇾', name: 'Uruguay' },
  { code: 'UZ', dial: '+998', flag: '🇺🇿', name: 'Uzbekistan' },
  { code: 'VU', dial: '+678', flag: '🇻🇺', name: 'Vanuatu' },
  { code: 'VA', dial: '+379', flag: '🇻🇦', name: 'Vatican City' },
  { code: 'VE', dial: '+58', flag: '🇻🇪', name: 'Venezuela' },
  { code: 'VN', dial: '+84', flag: '🇻🇳', name: 'Vietnam' },
  { code: 'YE', dial: '+967', flag: '🇾🇪', name: 'Yemen' },
  { code: 'ZM', dial: '+260', flag: '🇿🇲', name: 'Zambia' },
  { code: 'ZW', dial: '+263', flag: '🇿🇼', name: 'Zimbabwe' },
];

// ── Grades per curriculum ─────────────────────────────────────────────────────
const GRADE_MAP = {
  'AQA A Level':                   ['Grade 11/Year 12', 'Grade 12/Year 13'],
  'AQA A-Level':                   ['Grade 11/Year 12', 'Grade 12/Year 13'],
  'Cambridge A Level':             ['Grade 11/Year 12', 'Grade 12/Year 13'],
  'Cambridge O Level':             ['Grade 9/Year 10',  'Grade 10/Year 11'],
  'Cambridge Pre IGCSE':           ['Grade 7/Year 8',   'Grade 8/Year 9'],
  'Cambridge Primary':             ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6'],
  'Edexcel A Level':               ['Grade 11/Year 12', 'Grade 12/Year 13'],
  'Edexcel International A Level': ['Grade 11/Year 12', 'Grade 12/Year 13'],
  'WAEC/NECO (SSCE)':              ['SS1', 'SS2', 'SS3'],
  'WAEC':                          ['SS1', 'SS2', 'SS3'],
  'NECO':                          ['SS1', 'SS2', 'SS3'],
  'JAMB/UTME':                     ['SS3 / Year 13'],
  'JAMB':                          ['SS3 / Year 13'],
  'Junior WAEC (BECE)':            ['JSS1', 'JSS2', 'JSS3'],
  'BECE':                          ['JSS1', 'JSS2', 'JSS3'],
  'IELTS':                         ['All Levels'],
  'TOEFL':                         ['All Levels'],
  'SAT':                           ['Grade 11', 'Grade 12'],
  // GCE A-Levels: Lower 6 (Year 12) and Upper 6 (Year 13)
  "GCE A' Levels":                 ['Lower 6 (Year 12)', 'Upper 6 (Year 13)'],
  'GCE A Levels':                  ['Lower 6 (Year 12)', 'Upper 6 (Year 13)'],
  'GCE':                           ['Lower 6 (Year 12)', 'Upper 6 (Year 13)'],
  // JUPEB: 1-year programme, Year 1 only
  'JUPEB':                         ['JUPEB Year 1'],
  // Language Lab: proficiency levels
  'Language Lab – English':        ['Beginner (A1)', 'Elementary (A2)', 'Intermediate (B1)', 'Upper-Intermediate (B2)', 'Advanced (C1)', 'Proficiency (C2)'],
  'Language Lab – French':         ['Beginner (A1)', 'Elementary (A2)', 'Intermediate (B1)', 'Upper-Intermediate (B2)', 'Advanced (C1)', 'Proficiency (C2)'],
  'Language Lab – Yoruba':         ['Beginner', 'Elementary', 'Intermediate', 'Advanced'],
};

// ── FIX A: Hardcoded fallback curricula used if the API call fails ─────────────
// This means the Curriculum dropdown is ALWAYS populated, even offline.
const FALLBACK_CURRICULA = [
  { id: null, code: 'JAMB',    name: 'JAMB/UTME',              icon_emoji: '' },
  { id: null, code: 'WAEC',    name: 'WAEC/NECO (SSCE)',        icon_emoji: '' },
  { id: null, code: 'BECE',    name: 'Junior WAEC (BECE)',      icon_emoji: '' },
  { id: null, code: 'GCE_AL',  name: "GCE A' Levels",          icon_emoji: '' },
  { id: null, code: 'JUPEB',   name: 'JUPEB',                   icon_emoji: '' },
  { id: null, code: 'CAMBAL',  name: 'Cambridge A Level',       icon_emoji: '' },
  { id: null, code: 'CAMBOL',  name: 'Cambridge O Level',       icon_emoji: '' },
  { id: null, code: 'AQAAL',   name: 'AQA A Level',             icon_emoji: '' },
  { id: null, code: 'EDXAL',   name: 'Edexcel A Level',         icon_emoji: '' },
  { id: null, code: 'IELTS',   name: 'IELTS',                   icon_emoji: '' },
  { id: null, code: 'TOEFL',   name: 'TOEFL',                   icon_emoji: '' },
  { id: null, code: 'SAT',     name: 'SAT',                     icon_emoji: '' },
  { id: null, code: 'LANG_EN', name: 'Language Lab – English',  icon_emoji: '' },
  { id: null, code: 'LANG_FR', name: 'Language Lab – French',   icon_emoji: '' },
  { id: null, code: 'LANG_YO', name: 'Language Lab – Yoruba',   icon_emoji: '' },
];

// ── Resolve grade options for a curriculum ───────────────────────────────────
// FIX: More robust matching — tries exact name, then code, then partial match,
// then falls back to sensible defaults instead of generic Grade 1/2/3.
function getGradeOptions(curriculum) {
  if (!curriculum) return [];
  const name = curriculum.name || '';
  const code = (curriculum.code || '').toUpperCase();

  // Exact name match
  if (GRADE_MAP[name]) return GRADE_MAP[name];

  // Code-based match
  const codeMap = {
    'JAMB':    GRADE_MAP['JAMB/UTME'],
    'WAEC':    GRADE_MAP['WAEC/NECO (SSCE)'],
    'NECO':    GRADE_MAP['WAEC/NECO (SSCE)'],
    'BECE':    GRADE_MAP['Junior WAEC (BECE)'],
    'IELTS':   GRADE_MAP['IELTS'],
    'TOEFL':   GRADE_MAP['TOEFL'],
    'SAT':     GRADE_MAP['SAT'],
    'GCE_AL':  GRADE_MAP["GCE A' Levels"],
    'GCE':     GRADE_MAP["GCE A' Levels"],
    'JUPEB':   GRADE_MAP['JUPEB'],
    'LANG_EN': GRADE_MAP['Language Lab – English'],
    'LANG_FR': GRADE_MAP['Language Lab – French'],
    'LANG_YO': GRADE_MAP['Language Lab – Yoruba'],
  };
  if (codeMap[code]) return codeMap[code];

  // Partial name match (case-insensitive)
  const lowerName = name.toLowerCase();
  if (lowerName.includes('jamb'))     return GRADE_MAP['JAMB/UTME'];
  if (lowerName.includes('waec') || lowerName.includes('neco') || lowerName.includes('ssce'))
    return GRADE_MAP['WAEC/NECO (SSCE)'];
  if (lowerName.includes('junior') || lowerName.includes('bece') || lowerName.includes('jss'))
    return GRADE_MAP['Junior WAEC (BECE)'];
  if (lowerName.includes('jupeb'))    return GRADE_MAP['JUPEB'];
  if (lowerName.includes('gce'))      return GRADE_MAP["GCE A' Levels"];
  if (lowerName.includes('language lab') || lowerName.includes('lang lab')) {
    if (lowerName.includes('french') || lowerName.includes('fr'))  return GRADE_MAP['Language Lab – French'];
    if (lowerName.includes('yoruba') || lowerName.includes('yo'))  return GRADE_MAP['Language Lab – Yoruba'];
    return GRADE_MAP['Language Lab – English']; // default language lab
  }
  if (lowerName.includes('cambridge') && lowerName.includes('primary'))
    return GRADE_MAP['Cambridge Primary'];
  if (lowerName.includes('cambridge') && (lowerName.includes('o level') || lowerName.includes('igcse')))
    return GRADE_MAP['Cambridge O Level'];
  if (lowerName.includes('cambridge') && lowerName.includes('pre'))
    return GRADE_MAP['Cambridge Pre IGCSE'];
  if (lowerName.includes('cambridge'))
    return GRADE_MAP['Cambridge A Level'];
  if (lowerName.includes('aqa'))
    return GRADE_MAP['AQA A Level'];
  if (lowerName.includes('edexcel') && lowerName.includes('international'))
    return GRADE_MAP['Edexcel International A Level'];
  if (lowerName.includes('edexcel'))
    return GRADE_MAP['Edexcel A Level'];
  if (lowerName.includes('ielts')) return GRADE_MAP['IELTS'];
  if (lowerName.includes('toefl')) return GRADE_MAP['TOEFL'];
  if (lowerName.includes('sat'))   return GRADE_MAP['SAT'];

  // Sensible default for unknown curricula
  return ['Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5', 'Year 6'];
}

// ── Country Code Picker ───────────────────────────────────────────────────────
function CountryCodePicker({ selected, onChange }) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState('');
  const ref       = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open) {
      setSearch('');
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open]);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? COUNTRY_CODES.filter(c =>
        c.name.toLowerCase().includes(q) || c.dial.includes(q) || c.code.toLowerCase() === q
      )
    : COUNTRY_CODES;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-3 bg-gray-50 hover:bg-gray-100 transition-colors border-r border-gray-300 rounded-l-lg"
      >
        <span className="text-lg leading-none">{selected.flag}</span>
        <span className="text-sm font-medium text-gray-700">{selected.dial}</span>
        <ChevronDown size={13} className="text-gray-400" />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl w-64 max-h-72 overflow-hidden flex flex-col">
          {/* Search — added when the list grew from 10 hard-coded countries to
              192 (see COUNTRY_CODES comment above); scrolling a list that
              long without a filter is impractical. */}
          <div className="p-2 border-b border-gray-100 sticky top-0 bg-white">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search country or code…"
              className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400"
            />
          </div>
          <div className="overflow-y-auto">
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-sm text-gray-400 text-center">No matching country</p>
            )}
            {filtered.map(c => (
              <button
                key={c.code}
                type="button"
                onClick={() => { onChange(c); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-indigo-50 transition-colors
                  ${selected.code === c.code ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-700'}`}
              >
                <span className="text-base">{c.flag}</span>
                <span className="flex-1">{c.name}</span>
                <span className="text-gray-400 text-xs">{c.dial}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Custom Dropdown ───────────────────────────────────────────────────────────
function CustomDropdown({ value, options, onChange, disabled, placeholder, loading }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close when disabled changes to true
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <div className="relative w-full" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-4 py-3 border rounded-lg text-sm transition-all
          ${disabled
            ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
            : 'bg-white border-gray-300 hover:border-indigo-400 cursor-pointer'}
          ${open ? 'border-indigo-500 ring-2 ring-indigo-100' : ''}
        `}
      >
        <span className={value ? 'text-gray-900 truncate' : 'text-gray-400'}>
          {loading ? 'Loading…' : (value || placeholder)}
        </span>
        {loading
          ? <svg className="animate-spin h-4 w-4 text-gray-400 shrink-0 ml-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          : open
            ? <ChevronUp size={15} className="text-gray-400 shrink-0 ml-1" />
            : <ChevronDown size={15} className="text-gray-400 shrink-0 ml-1" />
        }
      </button>
      {open && options.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-56 overflow-y-auto">
          {options.map((opt, i) => {
            const optLabel = typeof opt === 'string' ? opt : (opt.name || String(opt));
            return (
              <button
                key={i}
                type="button"
                onClick={() => { onChange(opt); setOpen(false); }}
                className={`w-full px-4 py-2.5 text-left text-sm hover:bg-indigo-50 hover:text-indigo-700 transition-colors
                  ${value === optLabel ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-700'}`}
              >
                {optLabel}
              </button>
            );
          })}
        </div>
      )}
      {/* FIX: Show a message when dropdown is open but has no options */}
      {open && options.length === 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl px-4 py-3">
          <p className="text-sm text-gray-400 text-center">No options available</p>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const RegisterPage = () => {
  const [formData, setFormData] = useState({
    fullName: '',
    email:    '',
    phone:    '',
    password: '',
    role:     'student',
  });

  const [countryCode,        setCountryCode]       = useState(
    COUNTRY_CODES.find(c => c.code === 'NG') || COUNTRY_CODES[0]
  );
  const [showPassword,       setShowPassword]       = useState(false);
  const [selectedCurriculum, setSelectedCurriculum] = useState(null);
  const [selectedGrade,      setSelectedGrade]      = useState('');
  const [curricula,          setCurricula]          = useState([]);
  const [loadingCurricula,   setLoadingCurricula]   = useState(true);
  // FIX A: Track API failure so we can show the fallback list
  const [usingFallback,      setUsingFallback]      = useState(false);
  const [error,              setError]              = useState('');
  const [loading,            setLoading]            = useState(false);
  const [termsAccepted,      setTermsAccepted]      = useState(false);

  const { register } = useAuth();
  const navigate      = useNavigate();

  // ── FIX A: Fetch curricula with fallback on failure ───────────────────────
  const fetchCurricula = () => {
    setLoadingCurricula(true);
    setUsingFallback(false);

    api.get('/exam-boards')
      .then(res => {
        // GET /exam-boards returns { success, count, data: [...boards] }
        // server-side, so res.data correctly resolves to the boards array
        // via apiClient's unwrap. The `|| res` fallback below is defensive
        // only — it is NOT true that "the interceptor returns response.data
        // directly" as a general rule; see QuizPage.jsx header comment for
        // the full contract. Only fields the interceptor explicitly hoists
        // (data, success, message, total, count, meta, and a few admin-
        // specific fields) are safe to read off the top level for ANY
        // endpoint; everything else is at res.data, and only when the
        // backend itself wrapped its response in data:{}.
        const boards = res.data || res || [];
        if (Array.isArray(boards) && boards.length > 0) {
          setCurricula(boards);
          setUsingFallback(false);
        } else {
          // Empty response — use fallback
          setCurricula(FALLBACK_CURRICULA);
          setUsingFallback(true);
        }
      })
      .catch(() => {
        // API unreachable — use hardcoded fallback so user is never stuck
        setCurricula(FALLBACK_CURRICULA);
        setUsingFallback(true);
      })
      .finally(() => setLoadingCurricula(false));
  };

  useEffect(() => {
    fetchCurricula();
  }, []);

  // FIX: Use robust grade resolution instead of exact key lookup
  const gradeOptions = getGradeOptions(selectedCurriculum);

  const handleChange = (e) =>
    setFormData(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleCurriculumChange = (opt) => {
    setSelectedCurriculum(opt);
    setSelectedGrade(''); // reset grade whenever curriculum changes
  };

  // isReady: curriculum/grade only required for students
  const isReady =
    formData.fullName.trim().length > 0 &&
    formData.email.trim().length > 0 &&
    formData.phone.trim().length > 0 &&
    formData.password.length >= 8 &&
    (selectedCurriculum !== null && selectedGrade !== '') &&
    termsAccepted;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (formData.role === 'student') {
      if (!selectedCurriculum) { setError('Please select a curriculum.'); return; }
      if (!selectedGrade)       { setError('Please select your grade.'); return; }
    }
    if (formData.password.length < 8) { setError('Password must be at least 8 characters.'); return; }

    const nameParts = formData.fullName.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName  = nameParts.slice(1).join(' ') || firstName;

    setLoading(true);
    try {
      const user = await register({
        firstName,
        lastName,
        email:             formData.email.trim().toLowerCase(),
        phone:             `${countryCode.dial}${formData.phone.trim()}`,
        password:          formData.password,
        role:              formData.role,
        pendingExamBoards: selectedCurriculum?.id ? [selectedCurriculum.id] : [],
        grade:             selectedGrade || null,
        terms_accepted:    true,
      });

      navigate(getPostAuthRedirect(user));
    } catch (err) {
      setError(err?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const BG_GRADIENT = 'linear-gradient(135deg, #f0f4ff 0%, #e8eeff 50%, #f5f0ff 100%)';
  const BTN_ACTIVE  = 'linear-gradient(135deg, #4f46e5 0%, #6d28d9 100%)';
  const ACCENT      = '#6366f1';

  return (
    <div className="min-h-screen flex flex-col" style={{ background: BG_GRADIENT }}>
      <PublicNav />

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div
          className="w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden flex"
          style={{ minHeight: '580px' }}
        >
          {/* ── Left panel ── */}
          <div
            className="hidden md:flex flex-col justify-center items-start flex-1 px-10 py-12 relative"
            style={{ background: 'linear-gradient(160deg, #3730a3 0%, #4338ca 50%, #2563eb 100%)' }}
          >
            <div className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-10"
              style={{ background: 'radial-gradient(circle, #818cf8, transparent)', transform: 'translate(30%, -30%)' }} />
            <div className="absolute bottom-0 left-0 w-40 h-40 rounded-full opacity-10"
              style={{ background: 'radial-gradient(circle, #a78bfa, transparent)', transform: 'translate(-30%, 30%)' }} />

            <h1 className="text-3xl xl:text-4xl font-bold text-white leading-tight mb-4 relative z-10">
              Join Us &amp;<br />
              <span style={{ color: '#818cf8' }}>Elevate Your Education</span>
            </h1>
            <p className="text-gray-300 text-sm xl:text-base max-w-xs leading-relaxed relative z-10">
              Make learning easy and hassle free by practising our study
              quizzes and using our resources to boost your confidence and
              achieve exam success!
            </p>

            <div className="mt-8 w-64 xl:w-72 relative z-10">
              <svg viewBox="0 0 280 230" xmlns="http://www.w3.org/2000/svg" className="w-full drop-shadow-2xl">
                <rect x="55" y="158" width="170" height="13" rx="5" fill="#7c3aed" opacity="0.9"/>
                <rect x="70" y="90"  width="140" height="70" rx="6" fill="#4c1d95"/>
                <rect x="74" y="94"  width="132" height="62" rx="4" fill="#1e1b4b"/>
                <rect x="78" y="98"  width="124" height="54" rx="3" fill="#0f0a2e"/>
                <rect x="82" y="102" width="60" height="8" rx="2" fill="#818cf8" opacity="0.8"/>
                <rect x="82" y="114" width="40" height="5" rx="2" fill="#a78bfa" opacity="0.5"/>
                <rect x="82" y="123" width="50" height="5" rx="2" fill="#a78bfa" opacity="0.4"/>
                <rect x="82" y="132" width="35" height="5" rx="2" fill="#a78bfa" opacity="0.3"/>
                <circle cx="175" cy="122" r="14" fill="none" stroke="#818cf8" strokeWidth="1.5" opacity="0.7"/>
                <circle cx="175" cy="122" r="4"  fill="#f472b6"/>
                <ellipse cx="175" cy="122" rx="14" ry="5" fill="none" stroke="#c4b5fd" strokeWidth="1" opacity="0.6"/>
                <ellipse cx="175" cy="122" rx="14" ry="5" fill="none" stroke="#c4b5fd" strokeWidth="1" opacity="0.6" transform="rotate(60 175 122)"/>
                <ellipse cx="175" cy="122" rx="14" ry="5" fill="none" stroke="#c4b5fd" strokeWidth="1" opacity="0.6" transform="rotate(-60 175 122)"/>
                <rect x="130" y="115" width="14" height="34" rx="7" fill="#34d399" opacity="0.85"/>
                <rect x="148" y="108" width="14" height="42" rx="7" fill="#f472b6" opacity="0.85"/>
                <rect x="112" y="120" width="14" height="28" rx="7" fill="#fbbf24" opacity="0.85"/>
                <rect x="164" y="88"  width="6"  height="28" rx="3" fill="#e2e8f0" opacity="0.9"/>
                <polygon points="164,116 170,116 167,126" fill="#818cf8" opacity="0.9"/>
                <circle cx="100" cy="100" r="3"   fill="#f472b6" opacity="0.7"/>
                <circle cx="210" cy="95"  r="2.5" fill="#818cf8" opacity="0.7"/>
                <circle cx="95"  cy="145" r="2"   fill="#fbbf24" opacity="0.6"/>
                <circle cx="215" cy="150" r="2"   fill="#c4b5fd" opacity="0.6"/>
              </svg>
            </div>
          </div>

          {/* ── Right panel — form ── */}
          <div className="flex-1 bg-white flex items-center justify-center px-8 py-10">
            <div className="w-full max-w-sm">

              <h2 className="text-2xl font-bold text-gray-900 text-center mb-1">
                Register With Us
              </h2>
              <p className="text-center text-gray-500 text-sm mb-7">
                Unlock a world of possibilities! Sign up now to access exclusive features.
              </p>

              {/* Error */}
              {error && (
                <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {/* FIX A: Offline / fallback notice with retry button */}
              {usingFallback && !loadingCurricula && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between gap-2">
                  <p className="text-xs text-amber-700">
                    Using offline curriculum list — some options may differ.
                  </p>
                  <button
                    type="button"
                    onClick={fetchCurricula}
                    className="flex items-center gap-1 text-xs text-amber-700 font-semibold hover:text-amber-900 shrink-0"
                  >
                    <RefreshCw size={12} /> Retry
                  </button>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">

                {/* Full Name */}
                <div className="relative">
                  <label className="absolute -top-2 left-3 px-1 bg-white text-xs text-gray-500 font-medium z-10">
                    Full Name *
                  </label>
                  <input
                    name="fullName"
                    type="text"
                    value={formData.fullName}
                    onChange={handleChange}
                    placeholder="Full Name"
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-colors"
                  />
                </div>

                {/* Email */}
                <div className="relative">
                  <label className="absolute -top-2 left-3 px-1 bg-white text-xs text-gray-500 font-medium z-10">
                    Email Address *
                  </label>
                  <input
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="Email Address"
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-colors"
                  />
                </div>

                {/* Phone */}
                <div className="relative">
                  <label className="absolute -top-2 left-3 px-1 bg-white text-xs text-gray-500 font-medium z-10">
                    Phone Number *
                  </label>
                  <div className="flex border border-gray-300 rounded-lg overflow-hidden focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-colors">
                    <CountryCodePicker selected={countryCode} onChange={setCountryCode} />
                    <input
                      name="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder="Phone number"
                      required
                      className="flex-1 px-3 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none bg-white"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="relative">
                  <label className="absolute -top-2 left-3 px-1 bg-white text-xs text-gray-500 font-medium z-10">
                    Password *
                  </label>
                  <input
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Password (min 8 characters)"
                    required
                    minLength={8}
                    className="w-full px-4 py-3 pr-11 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                  {/* FIX B: Live password strength indicator */}
                  {formData.password.length > 0 && formData.password.length < 8 && (
                    <p className="text-xs text-amber-600 mt-1 ml-1">
                      {8 - formData.password.length} more character{8 - formData.password.length !== 1 ? 's' : ''} needed
                    </p>
                  )}
                </div>

                {/* Role selector */}
                <div className="relative">
                  <label className="absolute -top-2 left-3 px-1 bg-white text-xs text-gray-500 font-medium z-10">
                    I am a *
                  </label>
                  <div className="flex gap-2 pt-1">
                    {[
                      { value: 'student', label: ' Student', desc: 'Access lessons & practice exams' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setFormData(f => ({ ...f, role: opt.value }))}
                        className={`flex-1 flex flex-col items-center py-3 px-2 border-2 rounded-lg text-xs font-medium transition-all
                          ${formData.role === opt.value
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                            : 'border-gray-200 bg-white text-gray-500 hover:border-indigo-300'}`}
                      >
                        <span className="text-lg mb-0.5">{opt.label.split(' ')[0]}</span>
                        <span className="font-semibold">{opt.label.split(' ').slice(1).join(' ')}</span>
                        <span className="text-gray-400 text-[10px] mt-0.5 text-center leading-tight">{opt.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Curriculum & Grade — only for students */}
                {formData.role === 'student' && (
                  <div className="flex gap-3">
                    <div className="relative flex-1">
                      <label className="absolute -top-2 left-3 px-1 bg-white text-xs text-gray-500 font-medium z-10">
                        Curriculum *
                      </label>
                      <CustomDropdown
                        placeholder="Curriculum"
                        value={selectedCurriculum?.name || ''}
                        options={curricula}
                        onChange={handleCurriculumChange}
                        loading={loadingCurricula}
                      />
                    </div>
                    <div className="relative flex-1">
                      <label className="absolute -top-2 left-3 px-1 bg-white text-xs text-gray-500 font-medium z-10">
                        Grade *
                      </label>
                      <CustomDropdown
                        placeholder="Grade"
                        value={selectedGrade}
                        options={gradeOptions}
                        onChange={(opt) => setSelectedGrade(typeof opt === 'string' ? opt : (opt.name || opt))}
                        disabled={!selectedCurriculum || loadingCurricula}
                      />
                    </div>
                  </div>
                )}

                {/* Terms of Service */}
                <div className="flex items-start gap-2 mt-2">
                  <input
                    type="checkbox"
                    id="terms"
                    checked={termsAccepted}
                    onChange={e => setTermsAccepted(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-gray-300 accent-indigo-600"
                  />
                  <label htmlFor="terms" className="text-xs text-gray-500 leading-relaxed">
                    I agree to the{' '}
                    <Link to="/terms" target="_blank" className="text-indigo-600 underline">Terms of Service</Link>
                    {' '}and{' '}
                    <Link to="/privacy" target="_blank" className="text-indigo-600 underline">Privacy Policy</Link>
                  </label>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading || !isReady}
                  className="w-full py-3 rounded-lg text-sm font-semibold text-white transition-all mt-1"
                  style={{
                    background: isReady && !loading ? BTN_ACTIVE : '#d1d5db',
                    cursor:     isReady && !loading ? 'pointer'   : 'not-allowed',
                  }}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      Creating account…
                    </span>
                  ) : 'Sign Up'}
                </button>

              </form>

              <p className="text-center text-sm text-gray-500 mt-5">
                Already have an account?{' '}
                <Link to="/login" className="font-semibold" style={{ color: ACCENT }}>
                  Login here
                </Link>
              </p>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
