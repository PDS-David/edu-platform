// client/src/pages/FrenchMasterclass.jsx
// Route: /french — thin wrapper, all real logic lives in LanguageMasterclass.jsx
import LanguageMasterclass from './LanguageMasterclass';

export default function FrenchMasterclass() {
  return <LanguageMasterclass language="french" />;
}
