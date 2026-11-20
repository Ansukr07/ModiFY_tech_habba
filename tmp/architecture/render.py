from pathlib import Path
from html import escape
import pymupdf

out=Path('output/architecture'); out.mkdir(parents=True,exist_ok=True)
def make(name,title,subtitle,rows,foot):
    svg=['<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">', '<rect width="1920" height="1080" fill="#080B10"/>', '<style>text{font-family:Arial,sans-serif;fill:#E9EEF5}.title{font-size:46px;font-weight:bold;fill:#92D050}.sub{font-size:24px;fill:#B5C2D2}.heading{font-size:24px;font-weight:bold;fill:#00B8E8}.body{font-size:23px}.lane{font-size:22px;fill:#92D050;font-weight:bold}</style>', '<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="#92D050"/></marker></defs>']
    def text(t,x,y,cls):
        size,color,bold={'title':(46,'#92D050',True),'sub':(23,'#B5C2D2',False),'heading':(24,'#00B8E8',True),'body':(20,'#E9EEF5',False),'lane':(22,'#92D050',True)}[cls]
        svg.append(f'<text x="{x}" y="{y}" font-family="Arial" font-size="{size}" font-weight="{700 if bold else 400}" fill="{color}">{escape(t)}</text>')
    text(title,60,73,'title');text(subtitle,60,117,'sub')
    for r,(lane,nodes) in enumerate(rows):
        y=183+r*264
        text(lane,60,y,'lane')
        for c,(heading,lines) in enumerate(nodes):
            x=60+c*462
            svg.append(f'<rect x="{x}" y="{y+22}" width="414" height="184" rx="12" fill="#18212D" stroke="#36506B" stroke-width="2"/>')
            text(heading,x+19,y+60,'heading')
            for n,line in enumerate(lines):text(line,x+19,y+98+n*29,'body')
            if c<3:
                svg.append(f'<path d="M{x+420},{y+113} H{x+445}" fill="none" stroke="#92D050" stroke-width="3"/><path d="M{x+443},{y+106} L{x+453},{y+113} L{x+443},{y+120} Z" fill="#92D050"/>')
        if r<2:
            svg.append(f'<path d="M1842,{y+206} V{y+235} H38 V{y+356} H54" fill="none" stroke="#92D050" stroke-width="2" marker-end="url(#arrow)"/>')
    for n,t in enumerate(foot):text(t,60,1008+n*31,'sub')
    svg.append('</svg>');p=out/(name+'.svg');p.write_text('\n'.join(svg),encoding='utf-8')
    doc=pymupdf.open(p);pdf=pymupdf.open('pdf',doc.convert_to_pdf()); pix=pdf[0].get_pixmap(matrix=pymupdf.Matrix(1,1),alpha=False);pix.save(out/(name+'.png'))
    assert pix.width==1920 and pix.height==1080

make('application-service-flow-landscape','APPLICATION AND SERVICE FLOW','Implemented prototype  /  Read left to right, then continue on the next row',[
('01  REQUEST AND ACCESS',[
('React 19 + Vite',['Owner: shop, rail, application','Lender: queue and assessment','Credentialed requests; INR to paise']),
('Express API :4000',['Cookie session, role, ownership','Validation + request identifiers','Idempotency + revision checks']),
('Application bundle',['Load shop, rails and cashflows','Requested amount in integer paise','MongoDB or memory-store reads']),
('FastAPI :8000',['POST /internal/agent alias','Pydantic request validation','8-second scoring client timeout'])]),
('02  SCORING AND UNDERWRITING',[
('Weekly features',['Normalize and aggregate cashflows','History + rolling four-week net','Concentration + evidence signals']),
('Evidence gates + risk',['Identity and verified-rail checks','Authenticity, then stress heuristics','Early UNVERIFIED or DECLINE']),
('Capacity and terms',['Lean surplus × policy haircut','Affordable repayment and rate','Capped principal + counteroffer']),
('Structured assessment',['Verdict, rate, tenure and cadence','Drivers + template explanation','Input hash + version metadata'])]),
('03  PERSISTENCE, REVIEW AND SIDE PATHS',[
('Audit and decision writes',['Audit first, then insert decision','Update latest decision and status','Cache idempotent API response']),
('Lender assessment',['Review report, evidence and terms','Override: reason + restricted action','Save override and audit linkage']),
('Separate stress scenario',['POST /stress-test: adjust a copy','Rescore with scenario_only true','Base decision remains unchanged']),
('Failure and storage controls',['Service failure: failed + audit + 503','No verified rail: zero offer','Mongo fallback: non-durable memory'])])],
['Demo rails are simulated. Active scoring: heuristic-v0. The agent endpoint currently runs ordinary scoring.', 'Python service authentication is not implemented. Side-path boxes describe branches, not extra approval steps.'])

make('training-agent-architecture-landscape','PROPOSED TRAINING AND AGENT ARCHITECTURE','Target design from spec-new.md  /  Offline training is separate from application inference',[
('01  OFFLINE MODEL B TRAINING',[
('Berka data + features',['Czech bank transactions, CZK','Canonical weekly cash-flow series','Scale-free features; no demographics']),
('Labels and account split',['Stress: next 4-week net < EMI ref','EMI ref = 35% of monthly inflow','70 / 15 / 15 account split; seed 42']),
('Training and calibration',['Logistic regression baseline','Histogram gradient boosting','Grouped CV; validation calibration']),
('Evaluation and artifacts',['ROC-AUC, PR-AUC and Brier','Class balance + loan sanity check','Joblib + metadata + model card'])]),
('02  ONLINE LANGGRAPH: TYPED STATE AND ALLOWLISTED TOOLS',[
('Validate and build features',['Pin input, schema and policy versions','Check provenance, rails and identity','Normalize weekly financial evidence']),
('Stress + authenticity tools',['Model B first; load saved artifacts','B-inflow or B-full by outflow rail','Model A or explicit authenticity rules']),
('Investigate exceptions',['Reconcile GST, bank and UPI gaps','Review concentration and invoices','Request missing evidence if needed']),
('Deterministic underwriting',['Lean month = worst 4-week net','÷ 4 × 52 / 12; apply policy haircut','Compute EMI, principal and terms'])]),
('03  DELIVERY, SAFETY AND SEPARATE EVALUATION',[
('Grounded explanation',['Agent explains drivers + counteroffer','All figures come from typed tools','Template fallback if LLM fails']),
('Audit and lender review',['Log input hash, provenance, versions','Write failure: retry, no completion','Lender owns the final credit decision']),
('Early exits and failures',['Missing verified rail: UNVERIFIED','Identity failure: review or decline','Model / schema error: fail closed']),
('Separate evaluation tools',['Exact financial twins: equal terms','Baseline on labelled demo cohort','Scenario only: no retraining'])])],
['Proposed capability. Current repository uses heuristic-v0 and a scoring alias rather than a LangGraph execution.', 'Berka is proxy data, not Indian MSME validation. Model A labels remain open. Agents cannot change policy or approve credit.'])

p=Path('docs/technical-architecture.md');s=p.read_text(encoding='utf-8');a,b=s.split('## 1. Application and service flow — full detail',1)
a=a.replace('flowchart TB','flowchart LR').replace('    direction LR','    direction TB')
a=a.replace('Each diagram groups implementation details into three horizontal lanes.','The Mermaid versions run left to right in three columns. The exported images use a fixed 1920 × 1080 landscape canvas with three horizontal lanes.')
links='\nLandscape exports for PowerPoint (1920 × 1080):\n\n- [Application and service flow — PNG](../output/architecture/application-service-flow-landscape.png) · [SVG](../output/architecture/application-service-flow-landscape.svg)\n- [Proposed training and agents — PNG](../output/architecture/training-agent-architecture-landscape.png) · [SVG](../output/architecture/training-agent-architecture-landscape.svg)\n\nSVG keeps lines and text sharp when resized. Each numbered lane continues left to right; error handling and evaluation boxes summarize separate branches.\n\n'
if 'Landscape exports for PowerPoint' not in a:
    a=a.replace('### Slide A — Application and service flow',links+'### Slide A — Application and service flow',1)
p.write_text(a+'## 1. Application and service flow — full detail'+b,encoding='utf-8')
print('Created two 1920x1080 PNG/SVG diagrams and updated the compact Mermaid layouts.')
