import { useWindowStore } from '../stores/windowStore';
import Window from './Window';

export default function WindowManager() {
  const windows = useWindowStore((s) => s.windows);

  return (
    <div className="window-manager" aria-label="Window manager">
      {Object.values(windows).map((win) => (
        <Window key={win.id} win={win} />
      ))}
    </div>
  );
}
