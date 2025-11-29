import { Footer } from '@/components/landing/Footer';
import { Header } from '@/components/landing/Header';
import { Hero } from '@/components/landing/Hero';
import { Features } from '@/components/landing/Features';
import { Steps } from '@/components/landing/Steps';
import { IntentScore } from '@/components/landing/IntentScore';
import { ContactForm } from '@/components/landing/ContactForm';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-emerald-50/20 to-white selection:bg-emerald-100 selection:text-emerald-700 text-slate-900">
      <Header />
      <main>
        <Hero />
        <Features />
        <Steps />
        <IntentScore />
        <ContactForm />
      </main>
      <Footer />
    </div>
  );
}
