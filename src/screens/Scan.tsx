import { useEffect, useRef, useState } from 'react';

// BarcodeDetector is not in TypeScript's DOM lib yet.
type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type DetectorCtor = new (options: { formats: string[] }) => Detector;

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
const BarcodeDetectorCtor = (globalThis as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;

type Props = { onBarcode: (barcode: string) => void; onBack: () => void };

export default function Scan({ onBarcode, onBack }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onBarcodeRef = useRef(onBarcode);
  onBarcodeRef.current = onBarcode;
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState<string | undefined>(
    BarcodeDetectorCtor ? undefined : 'This browser has no barcode scanner. Type the barcode instead.',
  );

  useEffect(() => {
    if (!BarcodeDetectorCtor) return;
    let stopped = false;
    let stream: MediaStream | undefined;
    let timer: number | undefined;
    const stop = () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        const video = videoRef.current;
        if (stopped || !video) return stop();
        video.srcObject = stream;
        await video.play();
        const detector = new BarcodeDetectorCtor({ formats: FORMATS });
        const tick = async () => {
          if (stopped) return;
          try {
            const [hit] = await detector.detect(video);
            if (hit?.rawValue && !stopped) {
              stop();
              onBarcodeRef.current(hit.rawValue);
              return;
            }
          } catch {
            // a frame that can't be decoded yet; try the next one
          }
          timer = window.setTimeout(tick, 150);
        };
        void tick();
      } catch {
        if (!stopped) setProblem('Camera unavailable (permission denied, or not on HTTPS). Type the barcode instead.');
      }
    })();

    return stop;
  }, []);

  return (
    <main className="screen">
      <header className="bar">
        <button onClick={onBack}>‹ Back</button>
        <h1>Scan</h1>
      </header>
      {problem ? <p className="notice">{problem}</p> : <video ref={videoRef} className="camera" muted playsInline />}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (typed.trim()) onBarcode(typed);
        }}
      >
        <input
          className="grow"
          inputMode="numeric"
          placeholder="or type a barcode"
          aria-label="Barcode"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
        <button className="primary" type="submit" disabled={!/\d/.test(typed)}>
          Look up
        </button>
      </form>
    </main>
  );
}
