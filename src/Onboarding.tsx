import { useEffect, useRef } from 'react';
import { Ruler, Palette, Calculator, ShieldCheck, Upload } from 'lucide-react';

export default function Onboarding({ onClose, onOpenSizes, onImport }: {
  onClose: () => void;
  onOpenSizes: () => void;
  onImport: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [onClose]);
  return <div className="dialog-backdrop onboarding-backdrop" onClick={onClose}>
    <section className="dialog onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="onboarding-title" onClick={e => e.stopPropagation()}>
      <span className="onboarding-kicker">Первый запуск</span>
      <h2 id="onboarding-title">Примерочная вашей квартиры</h2>
      <p className="onboarding-lead">Перед вами демонстрационная квартира. Импортируйте свой проект JSON или начните с демо и замените размеры вручную.</p>
      <ol className="onboarding-steps">
        <li>
          <Ruler size={20} aria-hidden="true" />
          <div><strong>Сверьте геометрию</strong><span>Вкладка «Размеры»: ширина и длина комнат, двери и окна. Изменения пересчитывают соседние стены.</span></div>
        </li>
        <li>
          <Palette size={20} aria-hidden="true" />
          <div><strong>Примерьте отделку и мебель</strong><span>План 2D, объём 3D и прогулка. Варианты хранят разные решения независимо.</span></div>
        </li>
        <li>
          <Calculator size={20} aria-hidden="true" />
          <div><strong>Посчитайте материалы</strong><span>Вкладка «Смета»: площади без проёмов, плинтус, упаковки, запас и известные цены.</span></div>
        </li>
      </ol>
      <p className="onboarding-warning"><ShieldCheck size={16} aria-hidden="true" /> Высоты проёмов и размеры мебели предварительные. До заказа нужны реальные обмеры и данные выбранных товаров.</p>
      <div className="dialog-actions">
        <button className="outline" onClick={() => fileRef.current?.click()}>
          <Upload size={15} />
          Импортировать свой проект
        </button>
        <button className="outline" onClick={onOpenSizes}>Проверить размеры</button>
        <button className="primary" autoFocus onClick={onClose}>Открыть демо</button>
        <input ref={fileRef} hidden type="file" accept="application/json,.json" aria-label="Импорт проекта JSON" onChange={e => {
          const file = e.target.files?.[0];
          if (file) onImport(file);
          e.target.value = '';
        }} />
      </div>
    </section>
  </div>;
}
