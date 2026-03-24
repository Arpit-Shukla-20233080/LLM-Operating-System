import Desktop from './components/Desktop';
import Taskbar from './components/Taskbar';
import WindowManager from './components/WindowManager';

export default function App() {
  return (
    <div className="os-shell">
      <div className="os-frame">
        <Desktop />
        <div className="os-windows-layer">
          <WindowManager />
        </div>
      </div>
      <Taskbar />
    </div>
  );
}