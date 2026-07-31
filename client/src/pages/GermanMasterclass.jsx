// client/src/pages/GermanMasterclass.jsx
// Route: /german — thin wrapper, all real logic lives in LanguageMasterclass.jsx
import LanguageMasterclass from './LanguageMasterclass';

export default function GermanMasterclass() {
  return <LanguageMasterclass language="german" />;
}
