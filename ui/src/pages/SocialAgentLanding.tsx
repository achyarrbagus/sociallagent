import { ArrowRight, ArrowUpRight, Bot, Check, ClipboardCheck, FolderKanban, Layers3, LineChart, Sparkles } from "lucide-react";
import { Link } from "@/lib/router";

const benefits = [
  { icon: FolderKanban, title: "Kelola pekerjaan di satu tempat", text: "Kumpulkan klien, brand, kampanye, dan tugas agar semua pekerjaan mudah ditemukan.", color: "blue" },
  { icon: Bot, title: "Bekerja bersama tim AI", text: "Atur agen dengan peran yang berbeda untuk membantu menjalankan pekerjaan kreatif.", color: "yellow" },
  { icon: ClipboardCheck, title: "Tinjau sebelum disetujui", text: "Periksa hasil, berikan arahan, dan pegang kendali atas keputusan penting.", color: "coral" },
  { icon: LineChart, title: "Pantau aktivitas dan biaya", text: "Lihat progres tugas dan penggunaan sumber daya dalam satu workspace.", color: "teal" },
];
const team = [
  ["Agency Director", "Mengatur prioritas dan mengoordinasikan pekerjaan tim."],
  ["Strategist", "Membantu merumuskan arah dan ide kampanye."],
  ["Copywriter", "Menyusun pesan dan konten sesuai kebutuhan brand."],
  ["Designer", "Mengembangkan arahan dan konsep visual kreatif."],
  ["Researcher", "Mengumpulkan informasi untuk mendukung pekerjaan."],
  ["SEO Specialist", "Membantu merencanakan konten yang mudah ditemukan."],
];
const steps = [
  ["Siapkan agensi Anda", "Buat organisasi dan siapkan tim untuk mulai bekerja."],
  ["Tambahkan pekerjaan", "Atur klien, brand, dan tugas yang ingin dikerjakan."],
  ["Bekerja bersama AI", "Berikan tugas kepada agen sesuai peran dan konfigurasinya."],
  ["Tinjau dan lanjutkan", "Periksa hasil, berikan masukan, dan pantau progres."],
];
const faqs = [
  ["Apa itu SocialAgent?", "SocialAgent adalah workspace agensi kreatif untuk mengelola pekerjaan bersama tim agen AI."],
  ["Siapa yang cocok menggunakan SocialAgent?", "Pemilik agensi, tim pemasaran, pemilik brand, kreator, dan pekerja lepas yang ingin mengelola pekerjaan kreatif bersama AI."],
  ["Apakah saya bisa meninjau hasil kerja agen AI?", "Ya. Anda dapat memantau tugas, meninjau hasil, dan memberikan persetujuan saat dibutuhkan."],
  ["Apakah saya perlu menghubungkan model AI sendiri?", "Tergantung konfigurasi SocialAgent Anda. Administrator dapat menyediakan model, atau pengguna dapat menghubungkan model sesuai pengaturan instance."],
];

function WorkspacePreview() {
  return <div className="landing-workspace" aria-label="Ilustrasi workspace SocialAgent">
    <div className="landing-window-bar"><span className="landing-dots" aria-hidden="true"><i /><i /><i /></span><span>SocialAgent / Workspace</span><span className="landing-chip">Contoh tampilan</span></div>
    <div className="landing-workspace-grid">
      <div className="landing-preview-panel"><div className="landing-preview-heading">TIM AI <span>Peran</span></div>{team.slice(0, 4).map(([name, description], i) => <div className="landing-agent" key={name}><span className={`landing-icon landing-${["blue", "coral", "yellow", "teal"][i]}`}><Bot size={18} /></span><span><strong>{name}</strong><small>{description}</small></span></div>)}</div>
      <div className="landing-preview-panel landing-review"><div className="landing-preview-heading">TINJAUAN <span>Contoh tugas</span></div><span className="landing-chip landing-yellow">Kampanye brand</span><h3>Ide kreatif siap ditinjau</h3><p>Tim menyiapkan konsep kampanye. Tinjau hasil dan berikan arahan untuk langkah berikutnya.</p><div className="landing-preview-note"><Sparkles size={17} /> Hasil dan percakapan tersimpan bersama tugas.</div><div className="landing-preview-actions"><span>Menunggu tinjauan</span><span className="landing-chip landing-teal"><Check size={14} /> Tugas terorganisir</span></div></div>
    </div>
    <div className="landing-window-footer"><span>● Klien & brand</span><span>● Tugas & persetujuan</span><span>● Aktivitas & biaya</span></div>
  </div>;
}

export function SocialAgentLanding() {
  return <div className="landing-frame"><main className="landing-page">
    <header className="landing-nav"><a href="#top" className="landing-brand"><span className="landing-brand-icon"><Sparkles size={19} /></span> SocialAgent</a><nav aria-label="Navigasi utama" className="landing-links"><a href="#fitur">Fitur</a><a href="#tim">Tim AI</a><a href="#cara-kerja">Cara kerja</a><a href="#faq">FAQ</a></nav><div className="landing-nav-actions"><Link className="landing-button landing-button-secondary" to="/app">Masuk</Link><Link className="landing-button landing-button-primary" to="/app">Mulai sekarang <ArrowUpRight size={16} /></Link></div></header>
    <section className="landing-hero" id="top"><span className="landing-eyebrow landing-yellow"><Sparkles size={14} /> AI CREATIVE WORKSPACE</span><h1>Tim kreatif AI untuk menjalankan ide besar Anda<span>.</span></h1><p>Kelola klien, kampanye, dan konten bersama tim AI dalam satu workspace. Pantau pekerjaan dan berikan persetujuan saat dibutuhkan.</p><div className="landing-hero-actions"><Link className="landing-button landing-button-primary" to="/app">Mulai sekarang <ArrowRight size={18} /></Link><a className="landing-button landing-button-secondary" href="#cara-kerja">Lihat cara kerja</a></div><WorkspacePreview /></section>
    <section className="landing-section" id="fitur"><div className="landing-section-heading"><span className="landing-eyebrow landing-yellow">KEUNGGULAN UTAMA</span><h2>Sistem terpadu untuk agensi modern</h2><p>Lebih mudah mengatur ide, pekerjaan, dan hasil kreatif dalam satu alur yang jelas.</p></div><div className="landing-benefits">{benefits.map(({ icon: Icon, title, text, color }) => <article className="landing-card" key={title}><span className={`landing-icon landing-${color}`}><Icon size={22} /></span><h3>{title}</h3><p>{text}</p></article>)}</div></section>
    <section className="landing-section landing-tinted" id="tim"><div className="landing-section-heading"><span className="landing-eyebrow landing-blue">TIM AI ANDA</span><h2>Tim dengan keahlian yang saling melengkapi</h2><p>Berbagai peran membantu Anda bergerak dari ide hingga hasil yang siap ditinjau.</p></div><div className="landing-team">{team.map(([name, text], i) => <article className="landing-card landing-team-card" key={name}><span className={`landing-icon landing-${["blue", "yellow", "coral", "teal"][i % 4]}`}><Bot size={19} /></span><h3>{name}</h3><p>{text}</p></article>)}</div></section>
    <section className="landing-section" id="cara-kerja"><div className="landing-section-heading"><span className="landing-eyebrow landing-coral">CARA KERJA</span><h2>Mulai dalam empat langkah</h2><p>Dari menyiapkan agensi hingga meninjau hasil, semua tetap terlihat.</p></div><div className="landing-steps">{steps.map(([title, text], i) => <article className="landing-card" key={title}><span className={`landing-step-number landing-${["blue", "yellow", "coral", "teal"][i]}`}>0{i + 1}</span><h3>{title}</h3><p>{text}</p></article>)}</div></section>
    <section className="landing-section landing-tinted" id="preview"><div className="landing-section-heading"><span className="landing-eyebrow landing-teal">WORKSPACE SOCIALAGENT</span><h2>Semua pekerjaan, satu pandangan</h2><p>Lihat siapa mengerjakan apa dan temukan hal yang membutuhkan perhatian Anda.</p></div><WorkspacePreview /></section>
    <section className="landing-section" id="faq"><div className="landing-section-heading"><span className="landing-eyebrow landing-yellow">PERTANYAAN UMUM</span><h2>Hal yang sering ditanyakan</h2></div><div className="landing-faq">{faqs.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div></section>
    <section className="landing-section landing-tinted"><div className="landing-closing"><span className="landing-eyebrow landing-yellow"><Layers3 size={14} /> MULAI DARI IDE ANDA</span><h2>Siap membangun tim kreatif AI Anda?</h2><p>Mulai kelola pekerjaan agensi dalam satu workspace.</p><Link className="landing-button landing-button-primary" to="/app">Mulai sekarang <ArrowRight size={18} /></Link></div></section>
    <footer className="landing-footer"><a href="#top" className="landing-brand"><span className="landing-brand-icon"><Sparkles size={17} /></span> SocialAgent</a><span>Workspace kreatif bersama tim AI.</span><a href="#top">Kembali ke atas ↑</a></footer>
  </main></div>;
}
