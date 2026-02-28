#!/usr/bin/env python3
"""
EWC Operational Intelligence System — Presentation Generator
Jwebly Ltd  |  joseph@jwebly.com

Creates:
  outputs/EWC_System_Architecture_Presentation_Edgbaston.pdf
  outputs/diagrams/ewc_full_system_architecture.png
  outputs/diagrams/ewc_call_flow_sequence.png
  outputs/diagrams/ewc_agent_decision_tree.png
  outputs/diagrams/ewc_data_integration_map.png
"""

import os, sys
from pathlib import Path

from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor, Color
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import numpy as np

# ============================================================
# PATHS
# ============================================================
BASE_DIR = Path(__file__).parent.parent
OUT_DIR  = BASE_DIR / 'outputs'
DIAG_DIR = OUT_DIR / 'diagrams'
OUT_DIR.mkdir(exist_ok=True)
DIAG_DIR.mkdir(exist_ok=True)
PDF_PATH = OUT_DIR / 'EWC_System_Architecture_Presentation_Edgbaston.pdf'

# ============================================================
# FONTS
# ============================================================
FONT_REG  = 'Helvetica'
FONT_BOLD = 'Helvetica-Bold'
try:
    pdfmetrics.registerFont(TTFont('Segoe',     r'C:\Windows\Fonts\segoeui.ttf'))
    pdfmetrics.registerFont(TTFont('SegoeBold', r'C:\Windows\Fonts\segoeuib.ttf'))
    FONT_REG  = 'Segoe'
    FONT_BOLD = 'SegoeBold'
    print("  Using Segoe UI for typography")
except Exception:
    print("  Using Helvetica for typography")

# ============================================================
# COLOURS
# ============================================================
BG     = HexColor('#0a0a0a')
BG2    = HexColor('#111111')
BG3    = HexColor('#1a1a1a')
PURPLE = HexColor('#8B5CF6')
BLUE   = HexColor('#3B82F6')
PURP_L = HexColor('#A78BFA')
BLUE_L = HexColor('#60A5FA')
GREEN  = HexColor('#10B981')
GREEN_L= HexColor('#34D399')
RED    = HexColor('#EF4444')
AMBER  = HexColor('#F59E0B')
WHITE  = HexColor('#FFFFFF')
LGRAY  = HexColor('#CCCCCC')
GRAY   = HexColor('#888888')
DGRAY  = HexColor('#444444')
DDGRAY = HexColor('#222222')

# Slide canvas — 16:9
W = 13.33 * inch
H = 7.50  * inch
TOTAL_SLIDES = 15

# Layout constants
PAD  = 0.20 * inch   # content padding inside panels
COL2 = W * 0.505     # two-column split x

# ============================================================
# DRAWING HELPERS
# ============================================================

def bg(c):
    c.setFillColor(BG)
    c.rect(0, 0, W, H, fill=1, stroke=0)

def grad_rect(c, x, y, w, h, c1, c2, steps=30):
    sw = w / steps
    for i in range(steps):
        t = i / (steps - 1)
        r = c1.red   + t * (c2.red   - c1.red)
        g = c1.green + t * (c2.green - c1.green)
        b = c1.blue  + t * (c2.blue  - c1.blue)
        c.setFillColor(Color(r, g, b))
        c.rect(x + i * sw, y, sw + 1, h, fill=1, stroke=0)

def top_bar(c, frac=0.45):
    grad_rect(c, 0, H - 0.055*inch, W * frac, 0.055*inch, PURPLE, BLUE)

def panel(c, x, y, w, h, fill=BG3, border=None, radius=6):
    c.setFillColor(fill)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=0)
    if border:
        c.setStrokeColor(border)
        c.setLineWidth(0.5)
        c.roundRect(x, y, w, h, radius, fill=0, stroke=1)

def sp(c, x, y, text, size, col, bold=False):
    """Place text at (x, y)."""
    c.setFont(FONT_BOLD if bold else FONT_REG, size)
    c.setFillColor(col)
    c.drawString(x, y, text)

def rsp(c, x, y, text, size, col, bold=False):
    """Right-aligned text at (x, y)."""
    c.setFont(FONT_BOLD if bold else FONT_REG, size)
    c.setFillColor(col)
    c.drawRightString(x, y, text)

def csp(c, y, text, size, col, bold=False):
    """Horizontally centred text."""
    c.setFont(FONT_BOLD if bold else FONT_REG, size)
    c.setFillColor(col)
    c.drawCentredString(W / 2, y, text)

def title(c, text, y=None, size=26):
    sp(c, 0.60*inch, y or H - 0.85*inch, text, size, WHITE, bold=True)

def subtitle(c, text, y=None):
    sp(c, 0.60*inch, y or H - 1.12*inch, text, 11, GRAY)

def footer(c, n):
    sp(c, 0.50*inch, 0.22*inch, 'Jwebly Ltd  |  joseph@jwebly.com  |  CONFIDENTIAL', 8, DGRAY)
    rsp(c, W - 0.50*inch, 0.22*inch, f'{n} / {TOTAL_SLIDES}', 8, DGRAY)

def hline(c, x1, x2, y, col=DDGRAY, lw=0.5):
    c.setStrokeColor(col)
    c.setLineWidth(lw)
    c.line(x1, y, x2, y)

def dot(c, x, y, r=4, col=PURPLE):
    c.setFillColor(col)
    c.circle(x, y, r, fill=1, stroke=0)

def bullet(c, x, y, text, size=10, col=PURPLE):
    c.setFillColor(col)
    c.circle(x + 4, y + size * 0.38, 3, fill=1, stroke=0)
    sp(c, x + 14, y, text, size, WHITE)

def chk(c, x, y, text, size=10, col=GREEN):
    sp(c, x, y, '+', size, col, bold=True)
    sp(c, x + 14, y, text, size, LGRAY)

def badge(c, x, y, text, col=PURPLE, size=9):
    c.setFont(FONT_REG, size)
    tw = c.stringWidth(text, FONT_REG, size)
    bw = tw + 16
    c.setFillColor(Color(col.red, col.green, col.blue, 0.15))
    c.roundRect(x, y - 3, bw, 17, 4, fill=1, stroke=0)
    c.setStrokeColor(col); c.setLineWidth(0.5)
    c.roundRect(x, y - 3, bw, 17, 4, fill=0, stroke=1)
    c.setFillColor(col)
    c.drawString(x + 8, y + 2, text)

def arr_down(c, x, y_top, length=0.14*inch, col=DGRAY):
    """Small downward arrow."""
    y_bot = y_top - length
    c.setStrokeColor(col); c.setLineWidth(0.8)
    c.line(x, y_top, x, y_bot + 0.04*inch)
    c.setFillColor(col)
    p = c.beginPath()
    p.moveTo(x - 4, y_bot + 0.05*inch)
    p.lineTo(x + 4, y_bot + 0.05*inch)
    p.lineTo(x,     y_bot)
    p.close()
    c.drawPath(p, fill=1, stroke=0)

def section_hdr(c, x, y, w, text, col=PURPLE):
    """Coloured section header label with underline."""
    sp(c, x, y, text, 8, col, bold=True)
    hline(c, x, x + w, y - 3, col=Color(col.red, col.green, col.blue, 0.4), lw=0.4)

# ============================================================
# SLIDES — clean systematic layout
# ============================================================

def slide_01(c):
    """Cover"""
    bg(c)
    # Glow accents
    c.setFillColor(Color(0.055, 0.036, 0.13, 0.55))
    c.rect(0, 0, W, H * 0.42, fill=1, stroke=0)
    c.setFillColor(Color(0.231, 0.510, 0.965, 0.04))
    c.circle(W * 0.82, H * 0.56, 2.5*inch, fill=1, stroke=0)
    # Grid
    c.setStrokeColor(Color(1, 1, 1, 0.02)); c.setLineWidth(0.4)
    for i in range(15): c.line(i*inch, 0, i*inch, H)
    for i in range(9):  c.line(0, i*inch, W, i*inch)
    top_bar(c, 0.50)
    sp(c, 0.70*inch, H - 0.55*inch, 'JWEBLY LTD  —  CONFIDENTIAL', 9, DGRAY)
    # Main title
    c.setFont(FONT_BOLD, 42); c.setFillColor(WHITE)
    c.drawString(0.70*inch, H * 0.55 + 0.10*inch, 'EWC Operational')
    c.drawString(0.70*inch, H * 0.55 - 0.52*inch, 'Intelligence System')
    grad_rect(c, 0.70*inch, H * 0.55 - 0.62*inch, 4.5*inch, 0.04*inch, PURPLE, BLUE)
    sp(c, 0.70*inch, H * 0.55 - 1.05*inch, 'System Architecture & Build Plan', 15, GRAY)
    # Client card
    panel(c, 0.70*inch, 1.55*inch, 4.20*inch, 0.82*inch,
          fill=Color(1,1,1,0.04), border=HexColor('#333333'), radius=8)
    sp(c, 1.00*inch, 2.22*inch, 'PREPARED FOR', 9, GRAY)
    sp(c, 1.00*inch, 1.94*inch, 'Dr Ganta  |  Edgbaston Wellness Clinic', 12, WHITE, bold=True)
    sp(c, 1.00*inch, 1.72*inch, 'Birmingham, United Kingdom', 9, GRAY)
    sp(c, 0.70*inch, 1.36*inch, 'February 2026', 10, GRAY)
    # Tags
    for i, (tag, col) in enumerate([
        ('Operational Intelligence', PURPLE), ('Voice AI (Vapi.ai)', BLUE),
        ('Patient Automation', GREEN), ('CQC Compliance', AMBER),
        ('Cliniko Integration', BLUE_L),
    ]):
        badge(c, W * 0.67, H * 0.77 - i * 0.42*inch, tag, col)
    footer(c, 1)


def slide_02(c):
    """Service Model"""
    bg(c); top_bar(c)
    title(c, 'How the Service Works')
    subtitle(c, 'One subscription. We handle everything. You focus on patients.')

    mid = COL2
    LX  = 0.45*inch        # left panel x
    RX  = mid + 0.20*inch  # right panel x
    PY  = 0.50*inch        # panel bottom
    PH  = H - 1.65*inch    # panel height (same for both)

    # LEFT — Wrong model
    panel(c, LX, PY, mid - LX - 0.12*inch, PH,
          fill=Color(0.94, 0.27, 0.27, 0.04),
          border=Color(0.60, 0.10, 0.10, 0.30))
    lp = LX + PAD
    lw = mid - LX - 0.12*inch - 2*PAD
    y = PY + PH - 0.30*inch
    sp(c, lp, y, 'DIY Infrastructure Model', 11, RED, bold=True); y -= 0.30*inch
    sp(c, lp, y, 'What clients often assume...', 9, DGRAY); y -= 0.40*inch
    for label, cost in [
        ('Vapi.ai — Voice AI', '~£100/mo'), ('Twilio — SMS & Calls', '~£40/mo'),
        ('n8n — Automation', '~£20/mo'), ('Supabase — Database', '~£15/mo'),
        ('Hosting & DevOps', '~£25/mo'), ('Jwebly service fee', '£50/mo'),
    ]:
        sp(c, lp, y, label, 10, LGRAY); rsp(c, LX + mid - LX - 0.12*inch - PAD, y, cost, 10, AMBER, bold=True)
        y -= 0.32*inch
    hline(c, lp, LX + mid - LX - 0.12*inch - PAD, y + 0.10*inch, col=HexColor('#3a1a1a'))
    y -= 0.12*inch
    sp(c, lp, y, 'Total cost:', 10, LGRAY); rsp(c, LX + mid - LX - 0.12*inch - PAD, y, '~£250/mo', 12, RED, bold=True)
    y -= 0.30*inch
    sp(c, lp, y, '+ Multiple vendor logins', 9, HexColor('#aa4444')); y -= 0.27*inch
    sp(c, lp, y, '+ Setup & maintenance burden', 9, HexColor('#aa4444')); y -= 0.27*inch
    sp(c, lp, y, '+ Technical support on YOU', 9, HexColor('#aa4444'))

    # RIGHT — Correct model
    panel(c, RX, PY, W - RX - 0.45*inch, PH,
          fill=Color(0.067, 0.722, 0.506, 0.05),
          border=Color(0.067, 0.722, 0.506, 0.30))
    rp = RX + PAD
    rw = W - RX - 0.45*inch - 2*PAD
    y = PY + PH - 0.30*inch
    sp(c, rp, y, 'Managed Service Model', 11, GREEN, bold=True); y -= 0.30*inch
    sp(c, rp, y, 'Simple. One bill. Zero overhead.', 9, DGRAY); y -= 0.42*inch
    section_hdr(c, rp, y, rw, 'WHAT YOU PAY — ALL INCLUSIVE', GREEN_L); y -= 0.35*inch
    sp(c, rp, y, 'Build period:', 10, LGRAY); rsp(c, RX + W - RX - 0.45*inch - PAD, y, '£300–£450/week', 10, PURP_L, bold=True)
    y -= 0.32*inch
    sp(c, rp, y, 'Trial subscription:', 10, LGRAY); rsp(c, RX + W - RX - 0.45*inch - PAD, y, '£50/month', 10, GREEN_L, bold=True)
    y -= 0.32*inch
    sp(c, rp, y, 'Ongoing (Month 4+):', 10, LGRAY); rsp(c, RX + W - RX - 0.45*inch - PAD, y, '£120/month', 10, GREEN_L, bold=True)
    y -= 0.45*inch
    section_hdr(c, rp, y, rw, 'JWEBLY MANAGES', GREEN_L); y -= 0.35*inch
    for item in ['All platform subscriptions', 'Infrastructure & hosting',
                 'System updates & monitoring', 'Technical support']:
        chk(c, rp, y, item, 10); y -= 0.30*inch
    hline(c, rp, RX + W - RX - 0.45*inch - PAD, y - 0.05*inch, col=Color(0.067,0.722,0.506,0.30))
    y -= 0.22*inch
    sp(c, rp, y, 'One monthly bill.', 11, WHITE, bold=True)
    sp(c, rp + 2.0*inch, y, 'We run the tech.', 11, GREEN_L, bold=True)
    footer(c, 2)


def slide_03(c):
    """What's Included"""
    bg(c); top_bar(c)
    title(c, 'Complete Managed Service')
    subtitle(c, 'Everything you need. One fee. Nothing extra to manage.')

    # Two-column checklist
    LW = (W - 1.30*inch) / 2
    LX = 0.55*inch
    RX = LX + LW + 0.20*inch
    PY = 0.52*inch
    PH = H - 1.78*inch

    # Left header
    panel(c, LX, PY + PH - 0.38*inch, LW, 0.38*inch,
          fill=Color(0.545, 0.361, 0.965, 0.12), border=PURPLE, radius=6)
    sp(c, LX + PAD, PY + PH - 0.18*inch, 'Platform & Infrastructure', 10, PURP_L, bold=True)
    y = PY + PH - 0.70*inch
    for item in ['EWC custom-built system', 'Vapi.ai — Voice AI receptionist',
                 'Twilio — SMS & phone', 'n8n — Automation engine',
                 'Supabase — Secure database', 'Vercel — Enterprise hosting',
                 'Daily automated backups', '24/7 system monitoring']:
        chk(c, LX + PAD, y, item, 11); y -= 0.38*inch

    # Right header
    panel(c, RX, PY + PH - 0.38*inch, LW, 0.38*inch,
          fill=Color(0.231, 0.510, 0.965, 0.12), border=BLUE, radius=6)
    sp(c, RX + PAD, PY + PH - 0.18*inch, 'Features & Support', 10, BLUE_L, bold=True)
    y = PY + PH - 0.70*inch
    for item in ['AI Receptionist (24/7 calls)', 'Patient retention automation',
                 'Staff KPI dashboards', 'CQC compliance tracking',
                 'Revenue monitoring & insights', 'Signal Operations intelligence',
                 'Cliniko integration', 'Payment link automation',
                 'Monthly performance reports', 'Email & WhatsApp support']:
        chk(c, RX + PAD, y, item, 11, BLUE); y -= 0.36*inch

    footer(c, 3)


def slide_04(c):
    """System Architecture"""
    bg(c); top_bar(c)
    title(c, 'How Everything Connects')
    subtitle(c, 'Five layers — from patient touchpoints to data intelligence.')

    layers = [
        ('PATIENT TOUCHPOINTS', ['Phone', 'SMS', 'WhatsApp', 'Email'], BLUE_L,
         Color(0.231,0.510,0.965,0.07), Color(0.231,0.510,0.965,0.30)),
        ('SYSTEM FEATURES', ['AI Receptionist','Patient Retention','Signal Ops','Staff KPIs','CQC','Revenue'], PURP_L,
         Color(0.545,0.361,0.965,0.07), Color(0.545,0.361,0.965,0.30)),
        ('AI INTELLIGENCE LAYER', ['EWC Agent','Orion — Sales','Arry — CRM'], PURPLE,
         Color(0.545,0.361,0.965,0.12), Color(0.545,0.361,0.965,0.50)),
        ('AUTOMATION WORKFLOWS', ['Reminders','Payment Links','Re-engagement','Compliance Alerts'], AMBER,
         Color(0.945,0.624,0.031,0.07), Color(0.945,0.624,0.031,0.30)),
        ('DATA LAYER', ['Cliniko','Supabase DB','Stripe','Analytics'], GREEN,
         Color(0.067,0.722,0.506,0.07), Color(0.067,0.722,0.506,0.30)),
    ]

    ROW_H   = 0.70 * inch
    ROW_GAP = 0.14 * inch
    TOTAL   = len(layers) * ROW_H + (len(layers)-1) * ROW_GAP
    START_Y = H - 1.45*inch - ROW_H   # top row y

    for idx, (label, items, col, fill, border) in enumerate(layers):
        ry = START_Y - idx * (ROW_H + ROW_GAP)
        panel(c, 0.50*inch, ry, W - 1.00*inch, ROW_H, fill=fill, border=border, radius=6)
        sp(c, 0.70*inch, ry + ROW_H * 0.5 - 0.04*inch, label, 7, col)
        n = len(items)
        item_w = (W - 3.20*inch) / n
        for j, item in enumerate(items):
            ix = 1.90*inch + j * item_w + item_w / 2
            iw = item_w * 0.82
            ih = 0.38*inch
            iy = ry + ROW_H * 0.5 - ih / 2
            panel(c, ix - iw/2, iy, iw, ih,
                  fill=Color(col.red,col.green,col.blue,0.15),
                  border=Color(col.red,col.green,col.blue,0.40), radius=5)
            c.setFont(FONT_REG, 9); c.setFillColor(WHITE)
            c.drawCentredString(ix, iy + 0.12*inch, item)
        if idx < len(layers) - 1:
            arr_down(c, W/2, ry - 0.01*inch, 0.10*inch)
    footer(c, 4)


def slide_05(c):
    """AI Receptionist"""
    bg(c); top_bar(c)
    badge(c, 0.60*inch, H - 0.46*inch, 'FEATURE 1 OF 5', BLUE)
    title(c, 'AI Receptionist')
    subtitle(c, 'Powered by Vapi.ai — answers every call, 24/7, instantly.')

    # Panel dimensions — both sides same height
    PY = 0.52*inch
    PH = H - 1.82*inch   # panel height
    LW = W * 0.52 - 0.72*inch
    RX = W * 0.54
    RW = W - RX - 0.48*inch

    # LEFT — Capabilities
    panel(c, 0.50*inch, PY, LW, PH, fill=BG3, border=Color(0.231,0.510,0.965,0.25))
    lp = 0.50*inch + PAD
    y = PY + PH - 0.32*inch
    section_hdr(c, lp, y, LW - 2*PAD, 'CAPABILITIES', BLUE_L); y -= 0.36*inch
    caps = [
        ('Answers all calls instantly',        'No hold times, no voicemail, ever'),
        ('Sounds completely natural',           'Patients cannot tell it is AI'),
        ('Unlimited concurrent calls',          'No busy signal regardless of volume'),
        ('Live Cliniko calendar check',         'Real-time availability during call'),
        ('Books appointments directly',         'Into Cliniko — no manual entry'),
        ('Sends Stripe payment links',          'Via SMS in under 30 seconds'),
        ('Records & transcribes calls',         'Full searchable audit trail'),
        ('Handles pricing objections',          'Naturally — with clinic-specific answers'),
    ]
    for ttl, dsc in caps:
        dot(c, lp + 4, y + 0.08*inch, r=3, col=BLUE)
        sp(c, lp + 14, y + 0.06*inch, ttl, 10, WHITE, bold=True)
        sp(c, lp + 14, y - 0.13*inch, dsc, 8.5, GRAY)
        y -= 0.38*inch

    # RIGHT — Technology + Call flow
    panel(c, RX, PY, RW, PH, fill=BG3, border=Color(0.231,0.510,0.965,0.20))
    rp = RX + PAD
    y = PY + PH - 0.32*inch
    section_hdr(c, rp, y, RW - 2*PAD, 'TECHNOLOGY', BLUE_L); y -= 0.36*inch
    for item in ['Vapi.ai — Voice AI engine', 'Anthropic Claude — Intelligence',
                 'Cliniko API — Live calendar', 'Twilio — Call routing & SMS']:
        bullet(c, rp, y, item, 9.5, BLUE_L); y -= 0.30*inch
    y -= 0.12*inch
    hline(c, rp, RX + RW - PAD, y + 0.08*inch, col=DDGRAY)
    y -= 0.20*inch
    section_hdr(c, rp, y, RW - 2*PAD, 'TYPICAL CALL FLOW', BLUE_L); y -= 0.36*inch
    for i, step in enumerate(['Patient dials clinic', 'AI answers in <1 second',
                               'Intent detected', 'Routes to Orion (Sales)',
                               'Checks Cliniko live', 'Handles objections',
                               'Books appointment', 'SMS confirmation sent']):
        panel(c, rp, y - 0.04*inch, RW - 2*PAD, 0.28*inch,
              fill=Color(0.231,0.510,0.965,0.10), border=None, radius=4)
        sp(c, rp + 0.10*inch, y + 0.06*inch, f'{i+1}.  {step}', 8.5, BLUE_L)
        y -= 0.36*inch

    footer(c, 5)


def slide_06(c):
    """Patient Retention"""
    bg(c); top_bar(c)
    badge(c, 0.60*inch, H - 0.46*inch, 'FEATURE 2 OF 5', GREEN)
    title(c, 'Patient Retention Automation')
    subtitle(c, 'Treatment-specific outreach — right message, right patient, right time.')

    flow = [
        ('Treatment Complete',     'Patient leaves clinic',                                     BLUE_L),
        ('Cliniko Monitored',      'System tracks treatment date & type',                       PURP_L),
        ('Trigger Fires',          'B12: 3mo  |  Botox: 4mo  |  Filler: 6mo  |  Cryo: 8wk',  AMBER),
        ('Personalised SMS Sent',  'Arry composes individual follow-up message',                GREEN_L),
        ('Patient Re-books',       'Link direct to Cliniko calendar — zero friction',           GREEN),
    ]

    BOX_H   = 0.68*inch
    BOX_GAP = 0.14*inch
    BOX_W   = W - 1.20*inch
    BOX_X   = 0.60*inch
    TOTAL_H = len(flow) * BOX_H + (len(flow)-1) * BOX_GAP
    START_Y = H - 1.48*inch - BOX_H

    for i, (step, desc, col) in enumerate(flow):
        ry = START_Y - i * (BOX_H + BOX_GAP)
        panel(c, BOX_X, ry, BOX_W, BOX_H,
              fill=Color(col.red,col.green,col.blue,0.07),
              border=Color(col.red,col.green,col.blue,0.30), radius=6)
        dot(c, BOX_X + 0.35*inch, ry + BOX_H / 2, r=5, col=col)
        sp(c, BOX_X + 0.65*inch, ry + BOX_H * 0.60, step, 12, WHITE, bold=True)
        sp(c, BOX_X + 0.65*inch, ry + BOX_H * 0.28, desc, 9.5, GRAY)
        rsp(c, BOX_X + BOX_W - 0.25*inch, ry + BOX_H * 0.60, f'Step {i+1}', 8, col)
        if i < len(flow) - 1:
            arr_down(c, BOX_X + BOX_W / 2, ry - 0.01*inch, 0.10*inch)

    # Bottom stat
    panel(c, 0.60*inch, 0.44*inch, W - 1.20*inch, 0.44*inch,
          fill=Color(0.067,0.722,0.506,0.08), border=Color(0.067,0.722,0.506,0.30))
    csp(c, 0.62*inch, 'Expected impact: 15-25 additional bookings/month  |  Est. value: £2,250-£3,750/month', 11, GREEN_L, bold=True)
    footer(c, 6)


def slide_07(c):
    """Signal Operations"""
    bg(c); top_bar(c)
    badge(c, 0.60*inch, H - 0.46*inch, 'KEY DIFFERENTIATOR', PURPLE)
    title(c, 'Signal Operations Intelligence')
    subtitle(c, 'Active intelligence — the system monitors, acts, and escalates when it should.')

    modes = [
        ('Auto',       'System handles completely\nwithout staff input',
         'Appointment reminders\nSMS delivery batches\nRoutine scheduling', BLUE),
        ('Agentic',    'Agent acts autonomously,\nnotifies you after',
         'Follow-up campaigns\nPayment chasing\nRetention outreach', PURPLE),
        ('Supervised', 'Agent recommends action,\nyou approve before it fires',
         'Churn risk decisions\nHigh-value invoices\nCorporate enquiries', AMBER),
        ('Human Only', 'Requires your direct\npersonal attention',
         'CQC compliance items\nClinical incidents\nEquipment failures', RED),
    ]

    N = len(modes)
    CARD_W = (W - 1.30*inch) / N - 0.10*inch
    CARD_H = H - 3.00*inch
    CARD_Y = 1.26*inch

    for i, (name, tagline, examples, col) in enumerate(modes):
        cx = 0.65*inch + i * (CARD_W + 0.13*inch)
        panel(c, cx, CARD_Y, CARD_W, CARD_H,
              fill=Color(col.red,col.green,col.blue,0.07),
              border=Color(col.red,col.green,col.blue,0.30), radius=8)
        # Top accent strip
        grad_rect(c, cx, CARD_Y + CARD_H - 0.06*inch, CARD_W, 0.06*inch,
                  Color(col.red,col.green,col.blue,0.80),
                  Color(col.red,col.green,col.blue,0.10))
        # Name
        c.setFont(FONT_BOLD, 14); c.setFillColor(col)
        c.drawCentredString(cx + CARD_W/2, CARD_Y + CARD_H - 0.42*inch, name)
        # Tagline (2 lines)
        for j, line in enumerate(tagline.split('\n')):
            sp(c, cx + 0.15*inch, CARD_Y + CARD_H - 0.72*inch - j*0.25*inch, line, 8.5, col)
        hline(c, cx+0.12*inch, cx+CARD_W-0.12*inch,
              CARD_Y + CARD_H - 1.28*inch, col=Color(col.red,col.green,col.blue,0.25))
        # Examples
        sp(c, cx + 0.15*inch, CARD_Y + CARD_H - 1.54*inch, 'EXAMPLES', 7, GRAY)
        for j, line in enumerate(examples.split('\n')):
            bullet(c, cx + 0.12*inch, CARD_Y + CARD_H - 1.84*inch - j * 0.32*inch,
                   line, 8.5, col)

    # Bottom banner
    panel(c, 0.60*inch, 0.44*inch, W - 1.20*inch, 0.72*inch,
          fill=Color(0.545,0.361,0.965,0.07), border=Color(0.545,0.361,0.965,0.30))
    csp(c, 0.80*inch, 'The system does what it can. Escalates what it should. You only see what needs you.', 11, PURP_L, bold=True)
    csp(c, 0.56*inch, 'Every action is logged — full audit trail, complete transparency.', 9.5, GRAY)
    footer(c, 7)


def slide_08(c):
    """Staff KPIs & CQC"""
    bg(c); top_bar(c)
    title(c, 'Staff KPIs & CQC Compliance')
    subtitle(c, 'Real-time dashboards — always inspection-ready.')

    MID = COL2
    PY  = 0.52*inch
    PH  = H - 1.72*inch
    LW  = MID - 0.65*inch
    RX  = MID + 0.20*inch
    RW  = W - RX - 0.48*inch

    # ---- LEFT: KPI dashboard ----
    panel(c, 0.45*inch, PY, LW, PH, fill=BG3, border=Color(0.545,0.361,0.965,0.25))
    lp = 0.45*inch + PAD
    y  = PY + PH - 0.32*inch
    section_hdr(c, lp, y, LW - 2*PAD, 'STAFF KPI DASHBOARD', PURP_L); y -= 0.35*inch

    # Table header
    panel(c, lp, y - 0.04*inch, LW - 2*PAD, 0.26*inch,
          fill=Color(0.545,0.361,0.965,0.15), border=None, radius=4)
    # Column widths (name=38%, rest=15.5% each)
    TCOLS = [0.38, 0.155, 0.185, 0.13, 0.15]
    TW    = LW - 2*PAD
    headers = ['Name', 'Treatments', 'Revenue', 'Rating', 'Rebook']
    tx = lp
    for h_lbl, frac in zip(headers, TCOLS):
        sp(c, tx + 0.05*inch, y + 0.08*inch, h_lbl, 7.5, PURP_L)
        tx += TW * frac
    y -= 0.34*inch

    # Data rows
    rows = [
        ('Dr Ganta',    '56', '£11,200', '4.9*', '91%'),
        ('Dr C. Walsh', '42', '£8,400',  '4.7*', '83%'),
        ('Ms Kapoor',   '38', '£7,200',  '4.8*', '79%'),
        ('Dr Patel',    '31', '£6,100',  '4.6*', '75%'),
    ]
    row_fills = [Color(1,1,1,0.025), Color(0,0,0,0)]
    for r, (name, trt, rev, rat, reb) in enumerate(rows):
        panel(c, lp, y - 0.04*inch, LW - 2*PAD, 0.30*inch,
              fill=row_fills[r%2], border=None, radius=3)
        tx = lp
        for val, frac in zip([name, trt, rev, rat, reb], TCOLS):
            is_name = (val == name)
            vc = PURP_L if val.startswith('£') else GREEN_L if val.endswith('%') and int(val[:-1])>80 else AMBER if val.endswith('%') else WHITE
            sp(c, tx + 0.05*inch, y + 0.08*inch, val, 8.5, vc, bold=is_name)
            tx += TW * frac
        y -= 0.33*inch

    y -= 0.12*inch
    hline(c, lp, lp + LW - 2*PAD, y + 0.08*inch, col=DDGRAY)
    y -= 0.20*inch

    # Metric tiles (3 across)
    TILE_W = (LW - 2*PAD) / 3 - 0.08*inch
    TILE_H = 0.85*inch
    TILE_Y = PY + PAD
    for j, (lbl, val, col) in enumerate([
        ('Calls Handled', '124', BLUE_L),
        ('Conversion', '38%', GREEN_L),
        ('Avg Handle', '4.2m', PURP_L),
    ]):
        tx = lp + j * (TILE_W + 0.08*inch)
        panel(c, tx, TILE_Y, TILE_W, TILE_H,
              fill=Color(col.red,col.green,col.blue,0.10),
              border=Color(col.red,col.green,col.blue,0.30), radius=6)
        sp(c, tx + 0.10*inch, TILE_Y + TILE_H - 0.28*inch, lbl, 7.5, GRAY)
        sp(c, tx + 0.10*inch, TILE_Y + 0.18*inch, val, 18, col, bold=True)

    # ---- RIGHT: CQC dashboard ----
    panel(c, RX, PY, RW, PH, fill=BG3, border=Color(0.067,0.722,0.506,0.25))
    rp = RX + PAD
    y  = PY + PH - 0.32*inch
    section_hdr(c, rp, y, RW - 2*PAD, 'CQC COMPLIANCE DASHBOARD', GREEN_L); y -= 0.35*inch

    # Readiness banner
    panel(c, rp, y - 0.04*inch, RW - 2*PAD, 0.46*inch,
          fill=Color(0.067,0.722,0.506,0.12), border=None, radius=5)
    sp(c, rp + 0.10*inch, y + 0.22*inch, '87%', 20, GREEN, bold=True)
    sp(c, rp + 0.80*inch, y + 0.24*inch, 'Inspection Ready', 11, WHITE, bold=True)
    sp(c, rp + 0.80*inch, y + 0.04*inch, '3 items need attention', 9, AMBER)
    y -= 0.62*inch

    section_hdr(c, rp, y, RW - 2*PAD, 'EQUIPMENT', GREEN_L); y -= 0.32*inch
    for name, status, col in [
        ('IPL Machine — Service', 'Expired Feb', RED),
        ('Ultrasound — PAT Test', 'Jul 2026',   GREEN),
        ('Cryo Unit — Service',   'Oct 2026',   GREEN),
    ]:
        sp(c, rp, y, name, 9, LGRAY)
        rsp(c, RX + RW - PAD, y, status, 9, col, bold=(col == RED))
        y -= 0.30*inch

    y -= 0.08*inch
    hline(c, rp, RX + RW - PAD, y + 0.05*inch, col=DDGRAY); y -= 0.25*inch
    section_hdr(c, rp, y, RW - 2*PAD, 'STAFF COMPLIANCE', GREEN_L); y -= 0.32*inch
    for name, status, col in [
        ('DBS Checks',       '4/4 clear',    GREEN),
        ('BLS Certification','2 expiring',    AMBER),
        ('Prof Registration','4/4 active',    GREEN),
        ('Insurance',        'All current',   GREEN),
    ]:
        sp(c, rp, y, name, 9, LGRAY)
        rsp(c, RX + RW - PAD, y, status, 9, col, bold=(col != GREEN))
        y -= 0.30*inch

    y -= 0.08*inch
    panel(c, rp, y - 0.36*inch, RW - 2*PAD, 0.36*inch,
          fill=Color(0.067,0.722,0.506,0.15), border=GREEN_L, radius=6)
    c.setFont(FONT_BOLD, 10); c.setFillColor(GREEN_L)
    c.drawCentredString(RX + RW/2, y - 0.18*inch, 'Download Inspection Pack')

    footer(c, 8)


def slide_09(c):
    """Revenue Monitoring"""
    bg(c); top_bar(c)
    badge(c, 0.60*inch, H - 0.46*inch, 'FEATURE 5 OF 5', GREEN)
    title(c, 'Revenue Monitoring & Intelligence')
    subtitle(c, 'Live financial intelligence — with AI decision support.')

    # TODAY strip
    STRIP_H = 0.88*inch
    STRIP_Y = H - 1.52*inch - STRIP_H
    panel(c, 0.50*inch, STRIP_Y, W - 1.00*inch, STRIP_H, fill=BG3, border=DDGRAY)
    sp(c, 0.75*inch, STRIP_Y + STRIP_H - 0.22*inch, "TODAY'S PERFORMANCE", 8, GRAY)
    metrics = [("Today's Revenue", '£3,280', GREEN_L), ('Bookings Today', '21', BLUE_L),
               ('Outstanding', '£2,400', AMBER), ('Conversion', '42%', PURP_L)]
    for j, (lbl, val, col) in enumerate(metrics):
        tx = 0.75*inch + j * (W - 1.50*inch) / 4
        sp(c, tx, STRIP_Y + STRIP_H - 0.42*inch, lbl, 8, GRAY)
        sp(c, tx, STRIP_Y + 0.18*inch, val, 20, col, bold=True)

    # Lower two panels
    MID   = W * 0.54
    PY    = 0.52*inch
    PH    = STRIP_Y - 0.18*inch - PY
    LW    = MID - 0.75*inch
    RX    = MID + 0.22*inch
    RW    = W - RX - 0.50*inch

    # LEFT: month breakdown
    panel(c, 0.50*inch, PY, LW, PH, fill=BG3, border=DDGRAY)
    lp = 0.50*inch + PAD
    y  = PY + PH - 0.30*inch
    section_hdr(c, lp, y, LW - 2*PAD, 'THIS MONTH vs LAST', GRAY); y -= 0.36*inch
    for name, val, chng, up in [
        ('Total Revenue',    '£48,600', '+12%', True),
        ('Botox',            '£8,400',  '-5%',  False),
        ('Dermal Filler',    '£14,200', '+18%', True),
        ('CoolSculpting',    '£16,800', '+25%', True),
        ('IV Therapy',       '£5,200',  '+8%',  True),
        ('GP & Screening',   '£4,000',  '-2%',  False),
    ]:
        is_tot = (name == 'Total Revenue')
        if is_tot:
            panel(c, lp - 0.08*inch, y - 0.05*inch, LW - 2*PAD + 0.08*inch, 0.30*inch,
                  fill=Color(0.067,0.722,0.506,0.08), border=None, radius=4)
        sp(c, lp, y + 0.06*inch, name, 10 if is_tot else 9,
           WHITE if is_tot else LGRAY, bold=is_tot)
        rsp(c, lp + LW - 2*PAD - 0.90*inch, y + 0.06*inch, val,
            10 if is_tot else 9, GREEN_L if is_tot else WHITE, bold=is_tot)
        rsp(c, lp + LW - 2*PAD, y + 0.06*inch, chng, 9,
            GREEN_L if up else RED, bold=True)
        y -= 0.34*inch if is_tot else 0.30*inch

    # RIGHT: AI insights
    panel(c, RX, PY, RW, PH, fill=BG3, border=DDGRAY)
    rp = RX + PAD
    y  = PY + PH - 0.30*inch
    section_hdr(c, rp, y, RW - 2*PAD, 'AI DECISION INSIGHTS', PURP_L); y -= 0.38*inch
    for icon, headline, detail, col in [
        ('!', 'Botox revenue -5%',          'Consider promo to Filler patients',    PURPLE),
        ('!', 'CoolSculpting demand high',   '+£2,100/mo potential (1 slot/wk)',     PURPLE),
        ('*', '3 invoices >60 days',         'Mr Davies £1,400 — personal call needed', AMBER),
        ('+', 'Mrs Patel not returned',      'High-LTV (£1,840) — 7 months inactive', GREEN_L),
    ]:
        IH = 0.72*inch
        panel(c, rp, y - IH + 0.10*inch, RW - 2*PAD, IH,
              fill=Color(col.red,col.green,col.blue,0.07),
              border=Color(col.red,col.green,col.blue,0.25), radius=5)
        sp(c, rp + 0.10*inch, y - 0.02*inch, headline, 10, WHITE, bold=True)
        sp(c, rp + 0.10*inch, y - 0.24*inch, detail, 8.5, GRAY)
        y -= IH + 0.08*inch

    footer(c, 9)


def slide_10(c):
    """Three AI Agents"""
    bg(c); top_bar(c)
    title(c, 'Intelligence Layer: AI Agents')
    subtitle(c, 'Three specialised agents — each with a defined role, scope, and toolset.')

    N = 3
    COL_W = (W - 1.30*inch) / N - 0.10*inch
    COL_H = H - 2.15*inch
    COL_Y = 0.95*inch

    agents = [
        ('EWC',   'Primary Agent',  'Operations & Coordination', PURPLE, PURP_L,
         ['General clinic enquiries', 'Multi-step coordination', 'Agent routing & handoff',
          'Operational monitoring',   'Signal creation',          'Pattern identification']),
        ('Orion', 'Sales Agent',    'Revenue Intelligence', BLUE, BLUE_L,
         ['New patient enquiries', 'Pricing & packages', 'Lead qualification',
          'Booking optimisation',  'Upsell recommendations', 'Corporate accounts']),
        ('Arry',  'CRM Agent',     'Patient Relationships', GREEN, GREEN_L,
         ['Existing patient comms',  'Retention campaigns',  'Post-treatment follow-ups',
          'Reschedule & complaints', 'Re-engagement outreach','Satisfaction monitoring']),
    ]

    for i, (code, name, role, col, lcol, items) in enumerate(agents):
        cx = 0.65*inch + i * (COL_W + 0.15*inch)
        panel(c, cx, COL_Y, COL_W, COL_H,
              fill=Color(col.red,col.green,col.blue,0.07),
              border=Color(col.red,col.green,col.blue,0.25), radius=10)
        grad_rect(c, cx, COL_Y + COL_H - 0.06*inch, COL_W, 0.06*inch,
                  Color(col.red,col.green,col.blue,0.80),
                  Color(col.red,col.green,col.blue,0.15))
        c.setFont(FONT_BOLD, 22); c.setFillColor(col)
        c.drawCentredString(cx + COL_W/2, COL_Y + COL_H - 0.52*inch, code)
        c.setFont(FONT_BOLD, 11); c.setFillColor(WHITE)
        c.drawCentredString(cx + COL_W/2, COL_Y + COL_H - 0.78*inch, name)
        c.setFont(FONT_REG, 8); c.setFillColor(col)
        c.drawCentredString(cx + COL_W/2, COL_Y + COL_H - 0.98*inch, role.upper())
        hline(c, cx+0.18*inch, cx+COL_W-0.18*inch, COL_Y + COL_H - 1.14*inch,
              col=Color(col.red,col.green,col.blue,0.30))
        for j, itm in enumerate(items):
            bullet(c, cx+0.18*inch, COL_Y + COL_H - 1.46*inch - j*0.30*inch, itm, 9, col)

    panel(c, 0.60*inch, 0.44*inch, W - 1.20*inch, 0.40*inch,
          fill=Color(1,1,1,0.02), border=DDGRAY)
    csp(c, 0.60*inch, 'Agents work via the AI Receptionist  ·  Trigger automations  ·  Log to Signal Operations', 10, GRAY)
    footer(c, 10)


def slide_11(c):
    """Call Flow"""
    bg(c); top_bar(c)
    title(c, 'A Real Call — End to End')
    subtitle(c, '"I am interested in Botox. Can I book this week?" — 30 seconds, zero staff.')

    steps = [
        ('Patient dials clinic number',    'Calls the EWC direct line',                    BLUE_L),
        ('AI Receptionist answers (<1s)',   'Powered by Vapi.ai — sounds completely human', BLUE_L),
        ('Orion (Sales Agent) activates',  'Detects new-enquiry intent',                   PURP_L),
        ('Live Cliniko check',             'Finds available slots this week',               PURP_L),
        ('Handles pricing objection',      '"Botox from £280 — first session 10% off"',     PURP_L),
        ('Patient confirms — booked',      'Appointment created in Cliniko instantly',      GREEN_L),
        ('SMS confirmation sent',          'With details + Stripe payment link',            GREEN_L),
        ('Dashboards updated',             'Revenue, KPI, Signal Ops all updated',          GREEN_L),
    ]

    MID = W / 2
    STEP_H = (H - 2.80*inch) / len(steps) - 0.06*inch
    SW = MID - 0.65*inch

    # Dashed centre line
    c.setStrokeColor(DDGRAY); c.setLineWidth(0.5); c.setDash(3, 3)
    c.line(MID - 0.05*inch, 0.92*inch, MID - 0.05*inch, H - 1.88*inch)
    c.setDash()

    for i, (step, desc, col) in enumerate(steps):
        sy = H - 1.88*inch - i * (STEP_H + 0.06*inch)
        left = (i < 4)
        sx = 0.50*inch if left else MID + 0.12*inch
        panel(c, sx, sy, SW, STEP_H,
              fill=Color(col.red,col.green,col.blue,0.07),
              border=Color(col.red,col.green,col.blue,0.30), radius=6)
        c.setFillColor(col)
        c.circle(sx + 0.30*inch, sy + STEP_H/2, 0.18*inch, fill=1, stroke=0)
        c.setFont(FONT_BOLD, 9); c.setFillColor(WHITE)
        c.drawCentredString(sx + 0.30*inch, sy + STEP_H/2 - 0.06*inch, str(i+1))
        sp(c, sx + 0.60*inch, sy + STEP_H * 0.60, step,  10, WHITE, bold=True)
        sp(c, sx + 0.60*inch, sy + STEP_H * 0.22, desc, 8.5, GRAY)

    panel(c, 0.50*inch, 0.44*inch, W - 1.00*inch, 0.38*inch,
          fill=Color(0.067,0.722,0.506,0.08), border=Color(0.067,0.722,0.506,0.30))
    csp(c, 0.60*inch, '30 seconds end-to-end  ·  Zero staff involvement  ·  Works at 2am on a Sunday', 11, GREEN_L, bold=True)
    footer(c, 11)


def slide_12(c):
    """Build Timeline"""
    bg(c); top_bar(c)
    title(c, '3-Week Delivery Plan')
    subtitle(c, 'Full system operational in 21 days.')

    weeks = [
        ('WEEK 1', 'Core Intelligence',
         ['AI receptionist configured & tested', 'Cliniko API integration live',
          'Dashboard & signals system active',   'First automations running'],
         BLUE, 'Test call demo — end of Week 1'),
        ('WEEK 2', 'Retention & Revenue',
         ['Treatment reminder workflows live', 'Payment link automation active',
          'Revenue dashboard & AI insights',   'Patient re-engagement campaigns'],
         PURPLE, 'First retention campaign runs'),
        ('WEEK 3', 'Compliance & Go-Live',
         ['CQC compliance system built',    'Staff KPI dashboards set up',
          'Evidence storage & export pack', 'Team training session (2h)'],
         GREEN, 'Go-live — start of Week 4'),
    ]

    # Post-launch banner at BOTTOM (above footer)
    BAN_H  = 0.38*inch
    BAN_Y  = 0.52*inch
    panel(c, 0.60*inch, BAN_Y, W - 1.20*inch, BAN_H,
          fill=Color(1,1,1,0.02), border=DDGRAY)
    sp(c, 0.80*inch, BAN_Y + 0.12*inch, 'POST-LAUNCH (Weeks 4-6):', 9, GRAY)
    sp(c, 2.52*inch, BAN_Y + 0.12*inch,
       'Daily monitoring  ·  Weekly check-ins  ·  Performance tuning  ·  Bug fixes included', 9, LGRAY)

    # Three week cards above the banner
    CARD_Y  = BAN_Y + BAN_H + 0.12*inch
    CARD_H  = H - 1.55*inch - CARD_Y
    CARD_W  = (W - 1.30*inch) / 3 - 0.12*inch

    for i, (wk_lbl, wk_name, deliverables, col, milestone) in enumerate(weeks):
        wx = 0.65*inch + i * (CARD_W + 0.18*inch)
        panel(c, wx, CARD_Y, CARD_W, CARD_H,
              fill=Color(col.red,col.green,col.blue,0.07),
              border=Color(col.red,col.green,col.blue,0.30), radius=8)
        grad_rect(c, wx, CARD_Y + CARD_H - 0.06*inch, CARD_W, 0.06*inch,
                  Color(col.red,col.green,col.blue,0.80),
                  Color(col.red,col.green,col.blue,0.15))
        sp(c, wx + 0.20*inch, CARD_Y + CARD_H - 0.38*inch, wk_lbl, 8.5, col)
        sp(c, wx + 0.20*inch, CARD_Y + CARD_H - 0.64*inch, wk_name, 13, WHITE, bold=True)
        hline(c, wx+0.15*inch, wx+CARD_W-0.15*inch, CARD_Y + CARD_H - 0.80*inch,
              col=Color(col.red,col.green,col.blue,0.25))
        sp(c, wx + 0.20*inch, CARD_Y + CARD_H - 1.02*inch, 'DELIVERABLES:', 7.5, GRAY)
        for j, d in enumerate(deliverables):
            bullet(c, wx + 0.18*inch, CARD_Y + CARD_H - 1.34*inch - j * 0.34*inch, d, 9, col)
        # Milestone panel at card bottom
        panel(c, wx + 0.12*inch, CARD_Y + 0.12*inch, CARD_W - 0.24*inch, 0.52*inch,
              fill=Color(col.red,col.green,col.blue,0.15), border=None, radius=5)
        c.setFont(FONT_REG, 7.5); c.setFillColor(col)
        c.drawCentredString(wx + CARD_W/2, CARD_Y + 0.46*inch, 'MILESTONE')
        c.setFont(FONT_REG, 8); c.setFillColor(WHITE)
        c.drawCentredString(wx + CARD_W/2, CARD_Y + 0.22*inch, milestone)

    footer(c, 12)


def slide_13(c):
    """Investment & Pricing"""
    bg(c); top_bar(c)
    title(c, 'Investment & Value')
    subtitle(c, 'Conservative ROI: 12x-25x return on monthly investment.')

    MID = COL2
    PY  = 0.52*inch
    PH  = H - 1.72*inch
    LW  = MID - 0.68*inch
    RX  = MID + 0.18*inch
    RW  = W - RX - 0.48*inch

    # ======= LEFT: What you pay =======
    panel(c, 0.45*inch, PY, LW, PH, fill=BG3, border=DDGRAY)
    lp = 0.45*inch + PAD
    y  = PY + PH - 0.32*inch
    section_hdr(c, lp, y, LW - 2*PAD, 'WHAT YOU PAY', GRAY); y -= 0.38*inch

    # BUILD PHASE
    section_hdr(c, lp, y, LW - 2*PAD, 'BUILD PHASE — 3 Weeks', PURP_L); y -= 0.30*inch
    sp(c, lp, y, 'Option A:', 9, GRAY); y -= 0.28*inch
    sp(c, lp + 0.10*inch, y, '£300 / week  x  3 weeks', 13, WHITE, bold=True)
    rsp(c, lp + LW - 2*PAD, y, '= £900 total', 10, PURP_L, bold=True)
    y -= 0.30*inch
    sp(c, lp, y, 'Option B:', 9, GRAY); y -= 0.28*inch
    sp(c, lp + 0.10*inch, y, '£450 / week  x  2 weeks', 13, WHITE, bold=True)
    rsp(c, lp + LW - 2*PAD, y, '= £900 total', 10, PURP_L, bold=True)
    y -= 0.28*inch
    sp(c, lp, y, 'Same investment, Option B completes faster.', 8.5, GRAY)
    y -= 0.35*inch

    hline(c, lp, lp + LW - 2*PAD, y + 0.08*inch, col=DDGRAY); y -= 0.22*inch

    # SUBSCRIPTION
    section_hdr(c, lp, y, LW - 2*PAD, 'SUBSCRIPTION — Starts Feb 2026', GREEN_L); y -= 0.32*inch
    for period, amount in [
        ('Feb 2026 (Month 1):', '£50 / month'),
        ('Mar 2026 (Month 2):', '£50 / month'),
        ('Apr 2026 (Month 3):', '£50 / month'),
        ('May 2026+ (Month 4+):', '£120 / month'),
    ]:
        sp(c, lp, y, period, 9, LGRAY)
        rsp(c, lp + LW - 2*PAD, y,
            amount, 10,
            GREEN_L if '£50' in amount else AMBER, bold=True)
        y -= 0.30*inch

    hline(c, lp, lp + LW - 2*PAD, y + 0.08*inch, col=DDGRAY); y -= 0.22*inch

    # PROTECTION
    section_hdr(c, lp, y, LW - 2*PAD, 'YOUR PROTECTION', BLUE_L); y -= 0.30*inch
    sp(c, lp, y, '→  Trial period — exit any time', 9, LGRAY); y -= 0.27*inch
    sp(c, lp, y, '→  No results = no obligation to continue', 9, LGRAY)

    # ======= RIGHT: What you get =======
    panel(c, RX, PY, RW, PH, fill=BG3, border=DDGRAY)
    rp = RX + PAD
    y  = PY + PH - 0.32*inch
    section_hdr(c, rp, y, RW - 2*PAD, 'WHAT YOU GET BACK', GRAY); y -= 0.38*inch

    for lbl, val in [
        ('Missed calls recovered',   '£600 – £2,700/mo'),
        ('Staff time saved',         '£520 – £1,040/mo'),
        ('Dormant patients returned','£450 – £3,000/mo'),
        ('Better conversion rate',   '£750 – £2,250/mo'),
        ('No-shows prevented',       '£450 – £3,000/mo'),
    ]:
        panel(c, rp, y - 0.05*inch, RW - 2*PAD, 0.38*inch,
              fill=Color(0.067,0.722,0.506,0.06), border=None, radius=4)
        sp(c, rp + 0.10*inch, y + 0.10*inch, lbl, 10, LGRAY)
        rsp(c, rp + RW - 2*PAD, y + 0.10*inch, val, 10, GREEN_L, bold=True)
        y -= 0.46*inch

    hline(c, rp, rp + RW - 2*PAD, y + 0.08*inch, col=DDGRAY); y -= 0.22*inch
    sp(c, rp, y, 'Conservative total:', 10, GRAY); y -= 0.36*inch
    sp(c, rp, y, '£1,500 – £3,000 / month', 18, GREEN, bold=True); y -= 0.42*inch
    sp(c, rp, y, 'ROI: 12x to 25x', 13, GREEN_L, bold=True); y -= 0.38*inch

    # ROI summary box
    BOX_H = y - PY - PAD
    if BOX_H > 0.50*inch:
        panel(c, rp, PY + PAD, RW - 2*PAD, BOX_H,
              fill=Color(0.067,0.722,0.506,0.08),
              border=Color(0.067,0.722,0.506,0.30), radius=6)
        mid_y = PY + PAD + BOX_H / 2
        sp(c, rp + 0.15*inch, mid_y + 0.15*inch, '£50-£120/mo investment', 10, WHITE, bold=True)
        sp(c, rp + 0.15*inch, mid_y - 0.10*inch, '£1,500-£3,000/mo returned', 11, GREEN_L, bold=True)
        sp(c, rp + 0.15*inch, mid_y - 0.30*inch, 'Trial period protects you.', 9, GRAY)

    footer(c, 13)


def slide_14(c):
    """Technical Stack"""
    bg(c); top_bar(c)
    title(c, 'Enterprise-Grade Technology')
    subtitle(c, 'Professional, proven, production-ready. Not scripts — a full product.')

    N = 2
    COL_W = (W - 1.30*inch) / N - 0.10*inch
    COL_H = H - 2.05*inch
    COL_Y = 0.52*inch

    sections = [
        ('OUR STACK — Custom Built', PURPLE, [
            ('Frontend',     ['Next.js 15 (React)', 'TypeScript', 'Tailwind CSS', 'Framer Motion']),
            ('Backend',      ['Supabase (PostgreSQL)', 'pgvector embeddings', 'Real-time subs']),
            ('Intelligence', ['Anthropic Claude Sonnet', 'Custom agent orchestration',
                              'Signal Operations engine', 'Semantic knowledge base']),
        ]),
        ('MANAGED TOOLS — We Run Everything', BLUE, [
            ('Voice & Comms', ['Vapi.ai — voice AI', 'Twilio — SMS & calls', 'n8n — automation workflows']),
            ('Data & Payments',['Cliniko API — live integration', 'Stripe — payment links',
                                'GoCardless — direct debit']),
            ('Hosting',       ['Vercel — 99.9% uptime SLA', 'Daily automated backups',
                                '24/7 monitoring & alerting']),
        ]),
    ]

    for ci, (header, hcol, groups) in enumerate(sections):
        px = 0.65*inch + ci * (COL_W + 0.20*inch)
        panel(c, px, COL_Y, COL_W, COL_H, fill=BG3,
              border=Color(hcol.red,hcol.green,hcol.blue,0.30))
        panel(c, px, COL_Y + COL_H - 0.38*inch, COL_W, 0.38*inch,
              fill=Color(hcol.red,hcol.green,hcol.blue,0.15), border=None, radius=8)
        sp(c, px + 0.20*inch, COL_Y + COL_H - 0.22*inch, header, 9, hcol, bold=True)
        y = COL_Y + COL_H - 0.70*inch
        for grp, items in groups:
            sp(c, px + 0.20*inch, y, grp.upper(), 7.5, DGRAY); y -= 0.28*inch
            for item in items:
                bullet(c, px + 0.18*inch, y, item, 10, hcol); y -= 0.30*inch
            y -= 0.10*inch

    footer(c, 14)


def slide_15(c):
    """Getting Started"""
    bg(c)
    c.setFillColor(Color(0.545,0.361,0.965,0.05))
    c.circle(W*0.5, H*0.5, 3.0*inch, fill=1, stroke=0)
    top_bar(c, 0.60)
    title(c, 'Getting Started', y=H - 0.88*inch)

    steps = [
        ('TODAY',          'Proposal & Invoice Sent',    'Invoice: £300 or £450 (Week 1)',  PURPLE),
        ('FRIDAY',         'Payment Received',           'Project confirmed & scheduled',   BLUE),
        ('MONDAY',         'Kickoff Call — 30 Mins',     'Technical requirements + access', BLUE_L),
        ('WEEK 1 FRIDAY',  'Test Call Demo',             'AI receptionist live & testable', GREEN),
        ('WEEK 3',         'Go-Live',                    'Full system · Training · Launch', GREEN_L),
    ]

    LINE_X   = W * 0.25
    Y_START  = H - 1.72*inch
    Y_END    = 0.90*inch
    Y_STEP   = (Y_START - Y_END) / (len(steps) - 1)

    c.setStrokeColor(DDGRAY); c.setLineWidth(1)
    c.line(LINE_X, Y_END, LINE_X, Y_START)

    for i, (when, what, detail, col) in enumerate(steps):
        sy = Y_START - i * Y_STEP
        c.setFillColor(BG); c.circle(LINE_X, sy, 8, fill=1, stroke=0)
        c.setFillColor(col); c.circle(LINE_X, sy, 6, fill=1, stroke=0)
        rsp(c, LINE_X - 0.22*inch, sy - 0.06*inch, when, 8.5, col, bold=True)
        panel(c, LINE_X + 0.22*inch, sy - 0.22*inch, W * 0.44, 0.44*inch,
              fill=Color(col.red,col.green,col.blue,0.07),
              border=Color(col.red,col.green,col.blue,0.25), radius=5)
        sp(c, LINE_X + 0.38*inch, sy + 0.04*inch, what,   11, WHITE, bold=True)
        sp(c, LINE_X + 0.38*inch, sy - 0.14*inch, detail, 8.5, GRAY)

    # Contact block
    CX = W * 0.73
    CW = W - CX - 0.50*inch
    CH = H - 1.95*inch
    panel(c, CX, 0.90*inch, CW, CH,
          fill=Color(0.545,0.361,0.965,0.08), border=PURPLE, radius=10)
    grad_rect(c, CX, 0.90*inch + CH - 0.06*inch, CW, 0.06*inch, PURPLE, BLUE)
    sp(c, CX + 0.28*inch, 0.90*inch + CH - 0.42*inch, 'Joseph Enemuwe', 13, WHITE, bold=True)
    sp(c, CX + 0.28*inch, 0.90*inch + CH - 0.62*inch, 'Founder & Solutions Architect', 8.5, PURP_L)
    hline(c, CX+0.20*inch, CX+CW-0.20*inch, 0.90*inch + CH - 0.76*inch,
          col=Color(0.545,0.361,0.965,0.30))
    for i, (ico, val) in enumerate([('Email:', 'joseph@jwebly.com'),
                                     ('Phone:', '+44 7450 024756'),
                                     ('Web:',   'jwebly.co.uk')]):
        ty = 0.90*inch + CH - 1.06*inch - i * 0.38*inch
        sp(c, CX + 0.28*inch, ty, ico, 8.5, PURP_L, bold=True)
        sp(c, CX + 0.90*inch, ty, val, 9.5, LGRAY)

    csp(c, 0.60*inch,
        '"Looking forward to transforming Edgbaston Wellness Clinic\'s operations."',
        9.5, GRAY)
    footer(c, 15)


# ============================================================
# BUILD PDF
# ============================================================

def build_pdf():
    print(f"\n  Building PDF: {PDF_PATH.name}")
    c = rl_canvas.Canvas(str(PDF_PATH), pagesize=(W, H))
    c.setTitle('EWC Operational Intelligence System — Architecture & Build Plan')
    c.setAuthor('Jwebly Ltd')
    c.setSubject('System Architecture Presentation — Edgbaston Wellness Clinic')

    slides = [slide_01, slide_02, slide_03, slide_04, slide_05,
              slide_06, slide_07, slide_08, slide_09, slide_10,
              slide_11, slide_12, slide_13, slide_14, slide_15]

    for i, fn in enumerate(slides):
        print(f"    Slide {i+1:02d}/{TOTAL_SLIDES}  {fn.__doc__}")
        fn(c)
        c.showPage()

    c.save()
    size_kb = PDF_PATH.stat().st_size / 1024
    print(f"  [OK] PDF saved - {size_kb:.0f} KB")


# ============================================================
# DIAGRAMS (unchanged — matplotlib)
# ============================================================

DARK_BG   = '#0a0a0a'
DARK_BG2  = '#141414'
PURP_HEX  = '#8B5CF6'
BLUE_HEX  = '#3B82F6'
GREEN_HEX = '#10B981'
AMBER_HEX = '#F59E0B'
RED_HEX   = '#EF4444'
GRAY_HEX  = '#555555'
WHITE_HEX = '#FFFFFF'
LGRAY_HEX = '#888888'

def setup_dark_fig(w, h, dpi=200):
    fig = plt.figure(figsize=(w, h), facecolor=DARK_BG, dpi=dpi)
    ax  = fig.add_axes([0, 0, 1, 1])
    ax.set_facecolor(DARK_BG)
    ax.set_xlim(0, w); ax.set_ylim(0, h); ax.axis('off')
    return fig, ax

def draw_box(ax, x, y, w, h, text, subtext=None, bg_col='#1a1a1a',
             border_col=PURP_HEX, text_col=WHITE_HEX, fontsize=9, radius=0.2):
    fc = FancyBboxPatch((x-w/2, y-h/2), w, h,
                        boxstyle=f'round,pad=0,rounding_size={radius}',
                        facecolor=bg_col, edgecolor=border_col, linewidth=1.2)
    ax.add_patch(fc)
    ax.text(x, y+(0.06 if subtext else 0), text, ha='center', va='center',
            color=text_col, fontsize=fontsize, fontweight='bold')
    if subtext:
        ax.text(x, y-0.22, subtext, ha='center', va='center',
                color=LGRAY_HEX, fontsize=fontsize*0.75)

def draw_arrow(ax, x1, y1, x2, y2, col=GRAY_HEX, style='->', lw=1.2, ls='-'):
    ax.annotate('', xy=(x2,y2), xytext=(x1,y1),
                arrowprops=dict(arrowstyle=style, color=col, lw=lw, ls=ls))

def diag_1_full_architecture():
    print("    Diagram 1: Full System Architecture")
    fig, ax = setup_dark_fig(16, 10, dpi=200)
    ax.text(8, 9.6, 'EWC Operational Intelligence System', ha='center', va='center',
            color=WHITE_HEX, fontsize=16, fontweight='bold')
    ax.text(8, 9.2, 'Full System Architecture — Jwebly Ltd', ha='center', va='center',
            color=LGRAY_HEX, fontsize=10)
    from matplotlib.collections import LineCollection
    for i, xi in enumerate(np.linspace(0.5, 7.5, 60)):
        t = i / 59
        col = tuple(int(PURP_HEX[1:][j*2:j*2+2], 16)/255*(1-t)+
                    int(BLUE_HEX[1:][j*2:j*2+2], 16)/255*t for j in range(3))
        ax.plot([xi, xi+0.15], [9.85, 9.85], color=col, lw=4, solid_capstyle='butt')
    layers = [
        (8.6, 'PATIENT TOUCHPOINTS',
         [(2.5,'Phone'), (5.2,'SMS'), (7.9,'WhatsApp'), (10.6,'Email'), (13.3,'Web')],
         BLUE_HEX, '#0d1f3c'),
        (7.0, 'SYSTEM FEATURES',
         [(2,'AI Receptionist'),(4.4,'Patient Retention'),(6.8,'Signal Ops'),
          (9.2,'Staff KPIs'),(11.4,'CQC Compliance'),(13.6,'Revenue Intel')],
         PURP_HEX, '#1a1030'),
        (5.35, 'AI INTELLIGENCE LAYER',
         [(4,'EWC Agent'),(8,'Orion — Sales'),(12,'Arry — CRM')],
         '#A78BFA', '#150f28'),
        (3.7, 'AUTOMATION WORKFLOWS',
         [(2.6,'Reminders'),(5.5,'Payment Links'),(8.2,'Re-engagement'),
          (10.8,'Compliance'),(13.4,'Scheduling')],
         AMBER_HEX, '#1f1505'),
        (2.1, 'DATA LAYER',
         [(3,'Cliniko'),(6,'Supabase DB'),(9,'Stripe'),(12,'Analytics')],
         GREEN_HEX, '#061a10'),
    ]
    for lcy, label, nodes, lc, lbg in layers:
        lh = 0.7
        fc = FancyBboxPatch((0.3, lcy-lh/2), 15.4, lh,
                            boxstyle='round,pad=0,rounding_size=0.15',
                            facecolor=lbg, edgecolor=lc, linewidth=1, alpha=0.9)
        ax.add_patch(fc)
        ax.text(0.6, lcy, label, ha='left', va='center', color=lc,
                fontsize=7, fontweight='bold', alpha=0.8)
        for nx, ntxt in nodes:
            nb = FancyBboxPatch((nx-1.0, lcy-0.22), 2.0, 0.44,
                                boxstyle='round,pad=0,rounding_size=0.1',
                                facecolor=lc+'22', edgecolor=lc, linewidth=0.8)
            ax.add_patch(nb)
            ax.text(nx, lcy, ntxt, ha='center', va='center',
                    color=WHITE_HEX, fontsize=8, fontweight='bold')
    for i in range(len(layers)-1):
        y1 = layers[i][0] - 0.35; y2 = layers[i+1][0] + 0.35
        draw_arrow(ax, 8, y1, 8, y2, col=GRAY_HEX, lw=1.5)
    ax.text(15.7, 0.2, 'jwebly.co.uk', ha='right', va='bottom', color=GRAY_HEX, fontsize=7)
    path = DIAG_DIR / 'ewc_full_system_architecture.png'
    fig.savefig(str(path), dpi=200, bbox_inches='tight', facecolor=DARK_BG)
    plt.close(fig)
    print(f"      [OK] Saved {path.name} ({path.stat().st_size//1024} KB)")

def diag_2_call_flow():
    print("    Diagram 2: Call Flow Sequence")
    fig, ax = setup_dark_fig(10, 14, dpi=200)
    ax.text(5, 13.6, 'EWC System — Call Flow Sequence', ha='center',
            color=WHITE_HEX, fontsize=14, fontweight='bold')
    ax.text(5, 13.2, 'Patient call to booking confirmation — ~30 seconds end-to-end',
            ha='center', color=LGRAY_HEX, fontsize=9)
    steps = [
        ('Patient Dials Clinic Number', 'Calls the EWC direct line', BLUE_HEX),
        ('AI Receptionist Answers', 'Vapi.ai responds in <1 second', BLUE_HEX),
        ('Speech to Text', 'Real-time transcription', '#60A5FA'),
        ('Intent Analysis', 'Claude AI determines enquiry type', PURP_HEX),
        ('Agent Routes', 'New enquiry — Orion activates', PURP_HEX),
        ('Cliniko Check', 'Live calendar query', '#A78BFA'),
        ('Handles Conversation', 'Pricing, objections, packages', PURP_HEX),
        ('Patient Confirms', 'Yes, book me in for Wednesday', '#A78BFA'),
        ('Books in Cliniko', 'Appointment created automatically', GREEN_HEX),
        ('SMS Confirmation Sent', 'Details + Stripe payment link', GREEN_HEX),
        ('Dashboards Updated', 'Revenue, KPI, Signal Ops', '#34D399'),
        ('Signal Logged', 'Full transcript + outcome recorded', '#34D399'),
    ]
    y_start = 12.6
    y_step  = (y_start - 0.6) / (len(steps)-1)
    box_w, box_h = 5.8, 0.52
    cx = 5.0
    ax.plot([cx, cx], [0.6, y_start], color='#222222', lw=2, zorder=1)
    for i, (step, desc, col) in enumerate(steps):
        y = y_start - i * y_step
        ax.add_patch(plt.Circle((cx,y), 0.14, facecolor=DARK_BG, edgecolor=col, linewidth=2, zorder=3))
        ax.add_patch(plt.Circle((cx,y), 0.08, facecolor=col, zorder=4))
        ax.text(cx-0.4, y, str(i+1), ha='center', va='center', color=col, fontsize=8, fontweight='bold')
        side = 1 if i%2==0 else -1
        bx = cx + side*(box_w/2+0.35)
        nb = FancyBboxPatch((bx-box_w/2, y-box_h/2), box_w, box_h,
                            boxstyle='round,pad=0,rounding_size=0.1',
                            facecolor=col+'18', edgecolor=col, linewidth=0.8)
        ax.add_patch(nb)
        ax.text(bx, y+0.08, step, ha='center', va='center', color=WHITE_HEX, fontsize=8.5, fontweight='bold')
        ax.text(bx, y-0.12, desc, ha='center', va='center', color=LGRAY_HEX, fontsize=7.5)
        ax.plot([cx+side*0.15, bx-side*box_w/2], [y,y], color=col+'55', lw=0.8, ls='--')
    ax.add_patch(FancyBboxPatch((1.5,0.05), 7.0, 0.42,
                                boxstyle='round,pad=0,rounding_size=0.1',
                                facecolor=GREEN_HEX+'18', edgecolor=GREEN_HEX, linewidth=1))
    ax.text(5, 0.27, 'Total time: ~30 seconds  |  Zero staff involvement  |  Works 24/7',
            ha='center', va='center', color='#34D399', fontsize=9, fontweight='bold')
    ax.text(9.8, 0.05, 'jwebly.co.uk', ha='right', va='bottom', color=GRAY_HEX, fontsize=7)
    path = DIAG_DIR / 'ewc_call_flow_sequence.png'
    fig.savefig(str(path), dpi=200, bbox_inches='tight', facecolor=DARK_BG)
    plt.close(fig)
    print(f"      [OK] Saved {path.name} ({path.stat().st_size//1024} KB)")

def diag_3_agent_decision_tree():
    print("    Diagram 3: Agent Decision Tree")
    fig, ax = setup_dark_fig(14, 9, dpi=200)
    ax.text(7, 8.65, 'EWC System — Agent Routing Decision Tree', ha='center',
            color=WHITE_HEX, fontsize=14, fontweight='bold')
    ax.text(7, 8.3, 'How calls and enquiries are intelligently routed to the right AI agent',
            ha='center', color=LGRAY_HEX, fontsize=9)
    draw_box(ax, 7, 7.5, 3.0, 0.55, 'Patient Interaction Received',
             'Call / SMS / WhatsApp / Web', DARK_BG2, BLUE_HEX, WHITE_HEX, 10)
    draw_arrow(ax, 7, 7.22, 7, 6.82, BLUE_HEX)
    draw_box(ax, 7, 6.5, 2.8, 0.55, 'EWC Agent Analyses',
             'Classifies intent & routes', '#1a1030', '#A78BFA', WHITE_HEX, 10)
    for tx, label in [(2.8,'New Enquiry'),(7,'Existing Patient'),(11.2,'General Question')]:
        draw_arrow(ax, 7, 6.22, tx, 5.72, GRAY_HEX)
        ax.text((7+tx)/2+(0.2 if tx>7 else -0.2 if tx<7 else 0),
                5.97, label, ha='center', va='center', color=GRAY_HEX, fontsize=7.5)
    agents = [
        (2.8,  5.45, 'Orion', 'Sales Intelligence Agent', BLUE_HEX, '#0d1f3c',
         ['Pricing enquiries','Booking requests','Package information',
          'Objection handling','Upsell opportunities','Lead qualification']),
        (7,    5.45, 'Arry',  'Patient Relations Agent',  GREEN_HEX, '#061a10',
         ['Reschedule requests','Post-treatment questions','Complaints & concerns',
          'Treatment history','Loyalty & retention','Satisfaction checks']),
        (11.2, 5.45, 'EWC',   'Primary Agent', '#A78BFA', '#150f28',
         ['Opening hours','Service information','Complex multi-step',
          'Agent coordination','Clinic monitoring','Signal creation']),
    ]
    for ax_x, ay, aname, arole, acol, abg, aitems in agents:
        draw_box(ax, ax_x, ay, 2.6, 0.55, aname, arole, abg, acol, WHITE_HEX, 11)
        for j, item in enumerate(aitems):
            iy = ay - 0.75 - j*0.42
            nb = FancyBboxPatch((ax_x-1.25, iy-0.16), 2.5, 0.34,
                                boxstyle='round,pad=0,rounding_size=0.05',
                                facecolor=acol+'18', edgecolor=acol+'55', linewidth=0.6)
            ax.add_patch(nb)
            ax.text(ax_x, iy+0.01, item, ha='center', va='center', color='#cccccc', fontsize=7.5)
    for tx, label, col in [
        (2.8,'Book appointment\nin Cliniko', BLUE_HEX),
        (7,'Update patient\nrecord + retention', GREEN_HEX),
        (11.2,'Create signal\n+ log outcome', '#A78BFA'),
    ]:
        draw_arrow(ax, tx, 5.17-6*0.42, tx, 0.72, col, ls='--')
        draw_box(ax, tx, 0.5, 2.4, 0.44, label, None, '#111111', col, WHITE_HEX, 8)
    ax.text(7, 0.97, 'ALL ROUTES: Signal logged  |  Dashboards updated  |  Automations fire  |  Audit trail created',
            ha='center', va='center', color=GRAY_HEX, fontsize=7.5)
    ax.text(13.6, 0.05, 'jwebly.co.uk', ha='right', va='bottom', color=GRAY_HEX, fontsize=7)
    path = DIAG_DIR / 'ewc_agent_decision_tree.png'
    fig.savefig(str(path), dpi=200, bbox_inches='tight', facecolor=DARK_BG)
    plt.close(fig)
    print(f"      [OK] Saved {path.name} ({path.stat().st_size//1024} KB)")

def diag_4_data_integration():
    print("    Diagram 4: Data Integration Map")
    fig, ax = setup_dark_fig(16, 10, dpi=200)
    ax.text(8, 9.65, 'EWC System — Data Integration Map', ha='center',
            color=WHITE_HEX, fontsize=14, fontweight='bold')
    ax.text(8, 9.3, 'How data flows between EWC and all connected systems',
            ha='center', color=LGRAY_HEX, fontsize=9)
    cx, cy = 8, 5.0
    draw_box(ax, cx, cy, 3.2, 1.0, 'EWC SYSTEM', 'Supabase Database  |  Intelligence Layer',
             '#150f28', PURP_HEX, WHITE_HEX, 13, radius=0.3)
    inputs = [
        (2.0, 8.0, 'Cliniko API',         'Patients / Appointments / Invoices', BLUE_HEX),
        (2.0, 6.5, 'Vapi.ai',             'Call recordings / Transcripts',      '#60A5FA'),
        (2.0, 5.0, 'Twilio',              'SMS delivery / Inbound replies',     AMBER_HEX),
        (2.0, 3.5, 'Staff Input',         'CQC evidence / Equipment records',   GREEN_HEX),
        (2.0, 2.0, 'Stripe / GoCardless', 'Payment status / Invoice updates',   GREEN_HEX),
    ]
    outputs = [
        (14.0, 8.0, 'Staff Dashboard',   'KPIs / Revenue / Compliance',          PURP_HEX),
        (14.0, 6.5, 'Signal Operations', 'Active signals / Agent trail',          '#A78BFA'),
        (14.0, 5.0, 'Automations',       'Reminders / Payment links',            AMBER_HEX),
        (14.0, 3.5, 'AI Agents',         'EWC / Orion / Arry — context',         BLUE_HEX),
        (14.0, 2.0, 'Reports',           'Monthly performance / Insights',        GREEN_HEX),
    ]
    for ix, iy, name, desc, col in inputs:
        draw_box(ax, ix, iy, 2.8, 0.65, name, desc, '#111111', col, WHITE_HEX, 9)
        ax.annotate('', xy=(cx-1.6, cy+(iy-cy)*0.35), xytext=(ix+1.4, iy),
                    arrowprops=dict(arrowstyle='->', color=GRAY_HEX, lw=1.2))
    for ox, oy, name, desc, col in outputs:
        draw_box(ax, ox, oy, 2.8, 0.65, name, desc, '#111111', col, WHITE_HEX, 9)
        ax.annotate('', xy=(ox-1.4, oy), xytext=(cx+1.6, cy+(oy-cy)*0.35),
                    arrowprops=dict(arrowstyle='->', color=col+'99', lw=1.2))
    ax.text(15.7, 0.1, 'jwebly.co.uk', ha='right', va='bottom', color=GRAY_HEX, fontsize=7)
    path = DIAG_DIR / 'ewc_data_integration_map.png'
    fig.savefig(str(path), dpi=200, bbox_inches='tight', facecolor=DARK_BG)
    plt.close(fig)
    print(f"      [OK] Saved {path.name} ({path.stat().st_size//1024} KB)")


# ============================================================
# MAIN
# ============================================================

def main():
    print('\n' + '='*60)
    print('  EWC Presentation Generator')
    print('  Jwebly Ltd  |  joseph@jwebly.com')
    print('='*60)
    print('\n[1/2] Building PDF presentation...')
    build_pdf()
    print('\n[2/2] Generating architectural diagrams...')
    diag_1_full_architecture()
    diag_2_call_flow()
    diag_3_agent_decision_tree()
    diag_4_data_integration()
    print('\n' + '='*60 + '\n  COMPLETE\n' + '='*60)
    print(f'\n  PDF:\n    {PDF_PATH}')
    print(f'\n  Diagrams:')
    for f in sorted(DIAG_DIR.glob('*.png')):
        print(f'    {f}  ({f.stat().st_size//1024} KB)')
    print()

if __name__ == '__main__':
    main()
