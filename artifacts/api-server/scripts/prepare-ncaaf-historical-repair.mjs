/** Offline source-document matching and review preparation ONLY.
 * Fixed input/output paths. No DB, worker, startup, environment file, HTTP, or
 * apply mode. Matches require operator review; generated output is NOT approval. */
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { build } from "esbuild";
if (process.argv.length !== 2) throw Error("No flags, apply mode or custom paths are accepted");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = resolve(root, "tmp/ncaaf-release-evidence-2026-10-16");
const read = async p => JSON.parse(await readFile(p, "utf8"));
const review = await read(resolve(root, "test/ncaaf-integrity/release-review/correction-manifest.json"));
const primary = await read(resolve(dir, "validated-observations.json"));
const original = await read(resolve(dir, "official-extractions.json"));
// Read-only SQL capture, not reconstructed JavaScript JSON. No connection here.
const preflight = await read(resolve(dir, "preflight-before.json"));
if (preflight.version !== "ncaaf-readonly-before-v1" || preflight.read_only !== "on"
  || preflight.projectId !== "long-darkness-97803638" || preflight.branchId !== "br-blue-frost-aqu7381i"
  || preflight.database !== "neondb" || !Number.isFinite(Date.parse(preflight.observed_at))
  || preflight.rows.length !== review.rows.length
  || new Set(preflight.rows.map(r => r.game_id)).size !== review.rows.length)
  throw Error("INVALID_EXACT_READONLY_PREFLIGHT");
const beforeFields = ["home_team_id","away_team_id","starts_at","home_score","away_score","game_updated_at",
  "result_id","result_home_score","result_away_score","result_updated_at","graded_at","grading_source"];
for (const row of review.rows) {
  const fresh = preflight.rows.find(r => r.game_id === row.gameId);
  if (!fresh || fresh.sport !== "NCAAF" || fresh.status !== "final"
    || beforeFields.some(k => row.before[k] !== fresh[k])) throw Error("REVIEWED_BEFOREIMAGE_CHANGED:"+row.gameId);
}
let pages = original.games.map(g => ({id:g.id,url:g.url,page:original.pages.find(p=>p.url===g.url)}));
for (const file of await readdir(dir)) if (/^(?:remaining-official-fetches|targeted-fetches|extra-fetches|matchup-fetches|completion-fetches)-\d+\.json$|^final-fetches\.json$/.test(file)) pages.push(...await read(resolve(dir,file)));
// These dated school pages redirected to canonical boxscores. The raw HTML
// preserves title/date metadata omitted by the earlier web text extraction.
// Extract literal title/table cells only; never run downloaded scripts or invent
// a final-score sentence. The raw response hash remains in the source index.
const rawSources=await read(resolve(dir,"raw-official-metadata.json"));
const decode=s=>s.replace(/&nbsp;|&#160;/g," ").replace(/&amp;/g,"&").replace(/&#39;|&#x27;/g,"'")
  .replace(/&quot;/g,'"').replace(/&lt;/g,"<").replace(/&gt;/g,">");
const htmlText=s=>decode(s.replace(/<script\b[\s\S]*?<\/script>/gi,"").replace(/<style\b[\s\S]*?<\/style>/gi,"")
  .replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim());
for(const source of rawSources){
  if(!review.rows.some(r=>r.gameId===source.id)||!/^NCAAF-[1-9]\d*$/.test(source.id))throw Error("Unapproved school archive identity");
  const html=await readFile(resolve(dir,source.id+"-official.html"),"utf8");
  if(createHash("sha256").update(html).digest("hex")!==source.sha256)throw Error("Raw official archive hash mismatch");
  const title=htmlText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]??"");
  const tables=[...html.matchAll(/<table\b[\s\S]*?<\/table>/gi)].slice(0,4).map(t=>[...t[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map(r=>"| "+[...r[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(c=>htmlText(c[1])).join(" | ")+" |").join("\n")).join("\n\n");
  const markdown=title+"\n\n"+tables;
  pages.unshift({id:source.id,url:source.url,page:{markdown,truncated:false},rawArchive:source.file,rawHash:source.sha256});
}
const normalize = s => s.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/university of /g,"").replace(/state/g,"st").replace(/[^a-z0-9]/g,"");
const aliases = {
  "Hawai'i Rainbow Warriors":["Hawaii","Hawai‘i","HAW"],"New Mexico State Aggies":["New Mexico St.","NMS","NMSU"],
  "Sacramento State Hornets":["Sacramento St.","SAC"],"Northern Illinois Huskies":["NIU"],
  "San José State Spartans":["San Jose St.","SJSU"],"San Diego State Aztecs":["San Diego St.","SDSU"],
  "Western Kentucky Hilltoppers":["WKU","Western Ky."],"Georgia Southern Eagles":["Ga. Southern","GS"],
  "Florida International Panthers":["FIU"],
  "Louisiana Ragin' Cajuns":["Louisiana","UL"],"Long Island University Sharks":["LIU"],
  "Northern Arizona Lumberjacks":["Northern Ariz.","NAU"],"North Dakota State Bison":["North Dakota St.","NDSU"],
  "Texas State Bobcats":["Texas St.","TXST"],"Florida A&M Rattlers":["Florida A&M","FAM"],
  "Central Michigan Chippewas":["Central Mich.","CMU"],"Old Dominion Monarchs":["Old Dominion","ODU"],
  "Illinois Fighting Illini":["Illinois"],"Colorado State Rams":["Colorado St.","CSU"],
  "UCLA Bruins":["UCLA"],"USC Trojans":["USC"],"SMU Mustangs":["SMU"],"BYU Cougars":["BYU"],
  "UAB Blazers":["UAB"],"FIU Panthers":["FIU"],
  "Stanford Cardinal":["Stanford","STA"],"Kennesaw State Owls":["Kennesaw St.","KSU"],
  "Missouri State Bears":["Missouri St.","MSU"],"East Carolina Pirates":["East Carolina","ECU"],
  "Troy Trojans":["Troy"],"South Dakota Coyotes":["South Dakota","USD"],
  "Morgan State Bears":["Morgan St.","MSU"],"Florida State Seminoles":["Florida St.","FSU"],
  "Miami Hurricanes":["Miami (FL)","MIA"],"Texas Southern Tigers":["Texas Southern","TSU"],
  "Washington State Cougars":["Washington St.","WSU"],"Utah State Aggies":["Utah St.","USU"],
  "Arizona State Sun Devils":["Arizona St.","ASU"],"Nevada Wolf Pack":["Nevada","NEV"],
  "Mississippi Valley State Delta Devils":["Mississippi Val.","MVS","MVSU"],
  "Mercyhurst Lakers":["Mercyhurst","MER"],"Montana State Bobcats":["Montana State","MSU"],
  "UTEP Miners":["UTEP","TEP"],"Arizona Wildcats":["Arizona","ARI"],"Air Force Falcons":["Air Force","AFA"],
  "Albany Great Danes":["Albany","UAlbany","ALB"],
  "Buffalo Bulls":["Buffalo","BUF"],"LSU Tigers":["LSU"],"Clemson Tigers":["Clemson","Clemson CLEM"],
  "UAlbany Great Danes":["UAlbany","ALB"],"North Dakota State Bison":["North Dakota St.","NDSU","NDS"],
};
const clean = s => s.replace(/!\[[^\]]*\]\([^)]*\)/g,"").replace(/\[([^\]]*)\]\([^)]*\)/g,"$1")
  .replace(/<[^>]*>/g," ").replace(/[*_#🏆]/gu,"").trim();
function matches(label,name) {
  const l=normalize(label), names=[name,...(aliases[name]??[])].map(normalize);
  return names.some(n=>l===n||n.startsWith(l)&&l.length>=4||l===n+n);
}
function tables(text) {
  const lines=text.split("\n"),result=[];
  for(let i=0;i<lines.length;i++) if(/^\|/.test(lines[i]) && /\b(?:Total|Final|F)\b/i.test(lines[i])) {
    const found=[];
    for(let j=i+1;j<Math.min(lines.length,i+9)&&lines[j].startsWith("|");j++){
      const cells=clean(lines[j]).split("|").map(x=>x.trim()).filter(Boolean);
      if(cells.length>1&&/^\d+$/.test(cells.at(-1)))found.push({line:lines[j],label:cells[0],score:Number(cells.at(-1)),index:j});
    }
    if(found.length>=2)result.push({lines,header:i,rows:found});
  }
  return result;
}
function scoringColumns(text, row) {
  const lines=text.split("\n");
  for(let i=0;i<lines.length;i++) if(/^\|.*Scoring Play/.test(lines[i])){
    const head=clean(lines[i]).split("|").map(x=>x.trim()).filter(Boolean),labels=head.slice(-2);
    const hi=labels.findIndex(l=>matches(l,row.homeTeam)),ai=labels.findIndex(l=>matches(l,row.awayTeam));
    if(hi<0||ai<0||hi===ai)continue;
    let j=i+1;while(j<lines.length&&lines[j].startsWith("|"))j++;
    const last=lines[j-1],scores=last?.split("|").map(x=>x.trim()).filter(Boolean).slice(-2)??[];
    if(scores.every(x=>/^\d+$/.test(x))&&Number(scores[hi])===row.proposed.homeScore&&Number(scores[ai])===row.proposed.awayScore){
      return {quote:lines.slice(i,j).join("\n"),home:{line:last,label:labels[hi],score:Number(scores[hi])},
        away:{line:last,label:labels[ai],score:Number(scores[ai])},layout:"SCORING_COLUMNS"};
    }
  }
}
function matchupScore(text,row){
  const lines=clean(text).split("\n").map(s=>s.trim()).filter(Boolean);
  for(let i=1;i<lines.length-2;i++)if(/^\d{1,2}-\d{1,2}$/.test(lines[i])&&/^(at|vs\.?)$/i.test(lines[i+1])){
    const first=lines[i-1],second=lines[i+2],scores=lines[i].split("-").map(Number);
    const homeFirst=matches(first,row.homeTeam)&&matches(second,row.awayTeam)&&/Status\s*Home/.test(text);
    const awayFirst=matches(first,row.awayTeam)&&matches(second,row.homeTeam)&&/Status\s*Away/.test(text);
    if(!homeFirst&&!awayFirst)continue;
    const home={line:lines[i],label:homeFirst?first:second,score:homeFirst?scores[0]:scores[1]};
    const away={line:lines[i],label:homeFirst?second:first,score:homeFirst?scores[1]:scores[0]};
    if(home.score===row.proposed.homeScore&&away.score===row.proposed.awayScore)return{home,away,quote:text,layout:"MATCHUP_SCORELINE"};
  }
}
function directFinal(text,row){
  const lines=text.split("\n"),notes=lines.findIndex(l=>/Texas State Postgame Notes/.test(l));
  // A university's institutional notes are distinct from an AP recap above them.
  const start=/\(AP\)/.test(text)?notes:0;if(start<0)return;
  for(let i=start;i<lines.length;i++){
    const line=lines[i];if(!/\bScore\b/.test(line)||/https?:/.test(line))continue;
    const find=(name,score)=>{
      for(const alias of [name,...(aliases[name]??[])]){
        const escape=alias.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
        const m=line.match(new RegExp(`(${escape})\\s*(?:\\([A-Za-z. ]{1,15}\\))?\\s+${score}\\b`));
        if(m)return{line:m[0],label:m[1],score};
      }
    };
    const home=find(row.homeTeam,row.proposed.homeScore),away=find(row.awayTeam,row.proposed.awayScore);
    if(home&&away)return{home,away,quote:notes>=0?lines.slice(notes,i+1).join("\n"):line,layout:"TEAM_ROWS",
      dateQuote:notes>=0?lines[notes]:undefined,authorship:"INSTITUTIONAL_POSTGAME_NOTES"};
  }
}
await mkdir(resolve(dir,"prepared"),{recursive:true});
const compiled=await build({stdin:{contents:"export * from './src/services/ncaafHistoricalRepair'; export { ncaafIntegrityHash } from './src/services/ncaafHistoricalIntegrity';",resolveDir:root,sourcefile:"<stdin>"},
  bundle:true,platform:"node",format:"esm",write:false,metafile:true,
  plugins:[{name:"no-application-startup",setup(b){b.onResolve({filter:/@workspace\/db|^pg$|node:(?:http|https|net|tls)|scheduler|app\.ts|index\.ts/},
    args=>{throw Error("Forbidden verifier dependency: "+args.path);});}}]});
const allowed=new Set(["ncaafHistoricalRepair.ts","ncaafFinalIngestion.ts","ncaafHistoricalIntegrity.ts"]);
for(const input of Object.keys(compiled.metafile.inputs))if(input!=="<stdin>"&&!allowed.has(input.split("/").at(-1)))throw Error("Unreviewed verifier dependency: "+input);
await writeFile(resolve(dir,"prepared/verifier.mjs"),compiled.outputFiles[0].text);
const {reviewOfficialFinal,validateRepairManifest,ncaafIntegrityHash,ncaafRepairRawBefore}=await import(resolve(dir,"prepared/verifier.mjs"));
const capturedAt=new Date().toISOString(), ready=[],quarantined=[], index=[];
for(const row of review.rows) {
  const observations=pages.filter(p=>p.id===row.gameId&&p.page?.markdown&&!p.page.markdown.includes("## 404"));
  let selected;
  for(const page of observations) {
    const text=page.page.markdown;
    for(const table of tables(text)) {
      const home=table.rows.find(r=>r.score===row.proposed.homeScore&&matches(r.label,row.homeTeam));
      const away=table.rows.find(r=>r.score===row.proposed.awayScore&&matches(r.label,row.awayTeam));
      if(home&&away&&home!==away){
        const quote=table.lines.slice(table.header,Math.max(home.index,away.index)+1).join("\n");
        selected={page,text,home,away,quote};break;
      }
    }
    if(!selected){const columns=scoringColumns(text,row);if(columns)selected={page,text,...columns};}
    if(!selected){const match=matchupScore(text,row);if(match)selected={page,text,...match};}
    if(!selected){const direct=directFinal(text,row);if(direct)selected={page,text,...direct};}
    if(selected)break;
  }
  if(!selected) {quarantined.push({gameId:row.gameId,reason:"NO_UNAMBIGUOUS_TEAM_BOUND_OFFICIAL_FINAL_TABLE",documentsFetched:observations.map(p=>p.url)});continue;}
  const {page,text,home,away,quote}=selected;
  const b=preflight.rows.find(r=>r.game_id===row.gameId), identity={gameId:row.gameId,homeTeamId:b.home_team_id,awayTeamId:b.away_team_id,kickoffAt:b.starts_at};
  const p=primary.decisions.find(p=>p.id===row.gameId);
  const slash=row.gameDate.slice(5,7)+"/"+row.gameDate.slice(8,10)+"/"+row.gameDate.slice(0,4);
  const unpadded=Number(row.gameDate.slice(5,7))+"/"+Number(row.gameDate.slice(8,10))+"/"+row.gameDate.slice(0,4);
  const dateLine=text.split("\n").find(l=>l.includes(slash)||l.includes(unpadded))??text.split("\n").find(l=>l.includes(page.url))??"";
  const entry={
    before:{gameId:row.gameId,homeTeamId:b.home_team_id,awayTeamId:b.away_team_id,kickoffAt:b.starts_at,
      homeScore:b.home_score,awayScore:b.away_score,gameUpdatedAt:b.game_updated_at,
      resultId:b.result_id,resultHomeScore:b.result_home_score,resultAwayScore:b.result_away_score,
      resultUpdatedAt:b.result_updated_at,gradedAt:b.graded_at,gradingSource:b.grading_source,
      ...ncaafRepairRawBefore(b.result_id,b.raw_is_sql_null,b.result_raw_md5)},
    input:{sport:"NCAAF",espnId:row.gameId,homeTeamId:b.home_team_id,awayTeamId:b.away_team_id,
      commenceTimeISO:b.starts_at,homeScore:row.proposed.homeScore,awayScore:row.proposed.awayScore,ncaafFinalCapture:p.capture},
    official:{sourceUrl:page.url,capturedAt,representation:"EXTRACTED_MARKDOWN",document:text,
      documentHash:createHash("sha256").update(text).digest("hex"),identity,gameDate:row.gameDate,
      homeScore:home.score,awayScore:away.score,finalQuote:quote,homeLabel:home.label,awayLabel:away.label,
      homeScoreQuote:home.line,awayScoreQuote:away.line,dateQuote:selected.dateQuote??dateLine,
      scoreLayout:selected.layout??"TEAM_ROWS",
      dateBasis:dateLine.includes(slash)?"EXPLICIT_GAME_DATE":"REVIEWED_GAME_DAY_AND_PUBLICATION_DATE",
      authorship:selected.authorship??"INSTITUTIONAL_BOXSCORE"},
  };
  const problems=reviewOfficialFinal(entry,capturedAt);
  if(problems.length){quarantined.push({gameId:row.gameId,reason:"SOURCE_REVIEW_REJECTED",reasons:problems,url:page.url});continue;}
  ready.push(entry); index.push({gameId:row.gameId,url:page.url,rawArchive:page.rawArchive,rawHash:page.rawHash,
    home:home.label+" "+home.score,away:away.label+" "+away.score,dateQuote:selected.dateQuote??dateLine,quote});
}
const manifest={version:"ncaaf-controlled-repair-v1",asOf:new Date().toISOString(),entries:ready};
const problems=ready.length?validateRepairManifest(manifest):["NO_ACCEPTABLE_REPAIRS"];
if(problems.length)throw Error("Invalid prepared manifest: "+problems.join(","));
await writeFile(resolve(dir,"prepared/manifest.json"),JSON.stringify(manifest,null,2));
await writeFile(resolve(dir,"prepared/review.json"),JSON.stringify({executionAuthorized:false,operatorReviewRequired:true,
  manifestHash:ncaafIntegrityHash(manifest),
  beforeObservedAt:preflight.observed_at,
  captureTimePolicy:"Conservative availability recorded after collection, never backdated to game time",matchedTables:index,quarantined},null,2));
// Keep the human-review inventory aligned with the executable-shaped draft.
// Supersede only null representation after checking every other before-value.
const manifestHash=ncaafIntegrityHash(manifest);
for(const row of review.rows){
  const b=preflight.rows.find(r=>r.game_id===row.gameId);
  row.before={...row.before,result_raw_md5:b.result_raw_md5,raw_is_sql_null:b.raw_is_sql_null};
}
review.preparation={status:"PREPARED_NOT_APPLIED",asOf:manifest.asOf,scope:ready.length,manifestHash,
  executionAuthorized:false,operatorReviewRequired:true,beforeObservedAt:preflight.observed_at,
  hostedDatabaseAccessThisStep:"READ_ONLY_PREFLIGHT",provenancePolicy:"EXPLICIT_SQL_NULL_OR_MISSING_ROW"};
review.summary.officialDocumentCorroborated=ready.length;
delete review.summary.independenceNotProven;
review.summary.officialDocumentMissing=quarantined.length;
review.summary.upstreamIndependenceNotCertified=true;
await writeFile(resolve(root,"test/ncaaf-integrity/release-review/correction-manifest.json"),JSON.stringify(review,null,2)+"\n");
const sourceIndexPath=resolve(root,"test/ncaaf-integrity/release-review/source-index.json");
const sourceIndex=await read(sourceIndexPath);
sourceIndex.preparedManifestHash=manifestHash;
sourceIndex.beforeObservedAt=preflight.observed_at;
sourceIndex.executionAuthorized=false;
await writeFile(sourceIndexPath,JSON.stringify(sourceIndex,null,2)+"\n");
console.log(JSON.stringify({matched:ready.length,quarantined:quarantined.length,quarantinedGames:quarantined},null,2));
