'use client'

import Link from 'next/link'
import Image from 'next/image'
import { IconArrowRight, IconFolders, IconBrandGithub } from '@tabler/icons-react'
import ArchitectureDemo from '@/components/landing/ArchitectureDemo'

const REPO_URL = 'https://github.com/RajdeepKushwaha5/SaySketch'

export default function LandingPage() {
  return (
    <div className="h-screen max-h-dvh w-full bg-background text-foreground font-sans overflow-y-auto overflow-x-hidden flex flex-col">
      <nav className="relative z-10 shrink-0 w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-10 pt-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center shadow-[2px_2px_0_var(--accent)]">
            <Image src="/saysketch-mark.svg" alt="" width={18} height={18} className="invert" />
          </div>
          <span className="font-display text-[17px] font-bold tracking-tight">SaySketch</span>
        </div>
        <div className="flex items-center gap-5 text-[12px] text-subtle">
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-foreground underline-offset-4 hover:underline">
            <IconBrandGithub className="w-4 h-4" />
            GitHub
          </a>
          <Link href="/library" className="font-semibold text-foreground underline-offset-4 hover:underline">
            Library
          </Link>
        </div>
      </nav>

      {/* hero: copy left, live demo right — both vertically centred in the first screen */}
      <main className="flex-1 w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-10 py-8 lg:py-6 grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-center gap-10 lg:gap-14">
        <section className="flex flex-col gap-5">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-accent">Voice-first diagrams · for Wispr Flow</p>
          <h1 className="font-display text-[46px] sm:text-[58px] lg:text-[60px] xl:text-[72px] font-extrabold tracking-[-0.035em] leading-[0.95]">
            Say it.
            <br />
            Watch it{' '}
            <span className="relative inline-block whitespace-nowrap">
              draw.
              <svg className="scribble absolute left-0 -bottom-2 w-full h-[0.35em] overflow-visible" viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true">
                <path d="M3 13 C 40 4, 80 18, 120 9 S 180 6, 197 11" fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round" style={{ ['--len' as string]: 210 }} />
              </svg>
            </span>
          </h1>
          <p className="text-[16px] sm:text-[17px] text-muted leading-relaxed max-w-md">
            Point at a shape, dictate the change, and review it before it lands. Your layout stays exactly where you left it — corrections, second thoughts and all.
          </p>
          <div className="flex flex-wrap items-center gap-4 mt-1">
            <Link href="/d/new" className="btn-ink px-6 py-3.5 text-[15px] group">
              Start drawing
              <IconArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link href="/library" className="btn-paper px-6 py-3.5 text-[15px]">
              Open library
              <IconFolders className="w-5 h-5" />
            </Link>
          </div>
        </section>

        <div className="w-full h-[min(560px,70vh)] lg:h-[min(680px,calc(100dvh-120px))] min-h-[440px]">
          <ArchitectureDemo />
        </div>
      </main>

      {/* slim footer: hackathon context, credits and how data is handled */}
      <footer className="shrink-0 w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-10 pb-6 pt-2">
        <svg className="w-full h-2 mb-4 text-surface" viewBox="0 0 1200 8" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 4 C 150 0, 300 8, 450 4 S 750 0, 900 4 S 1100 8, 1200 4" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-[12.5px] text-subtle">
          <p>
            Built by voice with <span className="font-semibold text-foreground">Wispr Flow</span> for{' '}
            <span className="font-semibold text-foreground">No Hands — the Wispr Challenge</span> by WeMakeDevs.
          </p>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>Diagrams stay in your browser · instructions are processed by an AI model (Groq)</span>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-foreground hover:text-accent underline underline-offset-4 decoration-accent">
              Source
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}
