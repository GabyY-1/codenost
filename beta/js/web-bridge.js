(() => {
  const PKEY="codenost.beta.projects.v1";
  const SKEY="codenost.beta.settings.v1";
  let previewUrl=null;

  const readProjects=()=>{try{return JSON.parse(localStorage.getItem(PKEY)||"[]")}catch{return[]}};
  const writeProjects=v=>localStorage.setItem(PKEY,JSON.stringify(v));
  const copy=v=>JSON.parse(JSON.stringify(v));
  const get=path=>{
    const p=readProjects().find(x=>x.path===path);
    if(!p) throw new Error("Projet BETA introuvable.");
    return p;
  };
  const put=p=>{
    const all=readProjects();
    const i=all.findIndex(x=>x.path===p.path);
    if(i>=0) all[i]=p; else all.unshift(p);
    writeProjects(all);
  };

  function filesFor(type){
    const all={
      empty:{},
      static:{
        "index.html":`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mon site</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<h1>Mon projet CodeNost</h1>
<script src="script.js"><\/script>
</body>
</html>`,
        "style.css":"body {\n  margin: 40px;\n  font-family: system-ui, sans-serif;\n}\n",
        "script.js":"console.log(\"CodeNost BETA\");\n"
      },
      javascript:{"index.js":"console.log(\"Bonjour CodeNost\");\n"},
      typescript:{"index.ts":"console.log(\"Bonjour CodeNost\");\n"},
      node:{"index.js":"console.log(\"Bonjour Node.js\");\n","package.json":"{\n  \"private\": true\n}\n"},
      python:{"main.py":"print(\"Bonjour CodeNost\")\n"},
      react:{"src/App.jsx":"export default function App(){ return <h1>React</h1> }\n"},
      vite:{"index.html":"<div id=\"app\"></div><script type=\"module\" src=\"/src/main.js\"><\/script>","src/main.js":"document.querySelector('#app').innerHTML='<h1>Vite</h1>';"}
    };
    return copy(all[type]||{});
  }

  function config(name,type,cloud){
    const preview=type==="static"?"static":null;
    return {
      schema:1,name,type,createdAt:new Date().toISOString(),
      commands:{run:null,build:null,preview},
      cloud:{enabled:!!cloud,projectId:null,lastSync:null},
      codenost:{autoSave:true,previewAutoReload:true},
      betaWeb:true
    };
  }

  function makeProject({name,template,cloud}){
    name=String(name||"").trim();
    if(!name) throw new Error("Nom invalide.");
    const path="beta://"+Date.now();
    const cfg=config(name,template,cloud);
    const files=filesFor(template);
    files[".pcn"]=JSON.stringify(cfg,null,2)+"\n";
    const p={path,name,type:template,config:cfg,files,dirs:[],openedAt:new Date().toISOString()};
    put(p);
    return {path,name,config:cfg};
  }

  function tree(p){
    const root={};
    for(const dir of p.dirs||[]){
      let n=root;
      for(const part of dir.split("/").filter(Boolean)){n[part]||={_t:"folder"};n=n[part]}
    }
    for(const fp of Object.keys(p.files||{})){
      let n=root; const parts=fp.split("/");
      parts.forEach((part,i)=>{
        if(i===parts.length-1)n[part]={_t:"file"};
        else{n[part]||={_t:"folder"};n=n[part]}
      });
    }
    const conv=(n,prefix="")=>Object.entries(n).filter(([k])=>k!=="_t").sort((a,b)=>{
      const af=a[1]._t==="folder",bf=b[1]._t==="folder";
      return af===bf?a[0].localeCompare(b[0]):af?-1:1;
    }).map(([name,v])=>{
      const path=prefix?prefix+"/"+name:name;
      return v._t==="folder"?{name,path,type:"folder",children:conv(v,path)}:{name,path,type:"file"};
    });
    return conv(root);
  }

  function staticPreview(p){
    if(p.config?.commands?.preview!=="static")return{ok:false,error:"La BETA web prévisualise directement les projets HTML/CSS/JS statiques. Les runtimes nécessitent Desktop."};
    let html=p.files["index.html"];
    if(!html)return{ok:false,error:"index.html introuvable."};
    const css=p.files["style.css"]||"",js=p.files["script.js"]||"";
    html=html.replace(/<link[^>]*href=["']style\.css["'][^>]*>/i,"<style>"+css+"</style>");
    html=html.replace(/<script[^>]*src=["']script\.js["'][^>]*><\/script>/i,"<script>"+js.replace(/<\/script/gi,"<\\/script")+"<\/script>");
    if(previewUrl)URL.revokeObjectURL(previewUrl);
    previewUrl=URL.createObjectURL(new Blob([html],{type:"text/html"}));
    return{ok:true,url:previewUrl};
  }

  window.codenost={
    platform:"web-beta",
    auth:{
      status:async()=>({authenticated:true,devBypass:true,user:{email:"BETA Web"},configured:false}),
      login:async p=>({ok:true,user:{email:p.email||"BETA Web"}}),
      logout:async()=>true,
      openSignup:async()=>({ok:false})
    },
    projects:{
      list:async()=>readProjects().map(p=>({path:p.path,name:p.name,type:p.type,openedAt:p.openedAt})),
      chooseLocation:async()=>"Stockage navigateur — BETA",
      create:async payload=>makeProject(payload),
      importFolder:async()=>{throw new Error("Import de dossier disponible dans CodeNost Desktop.");},
      cloneGithub:async()=>{throw new Error("Import GitHub disponible dans CodeNost Desktop.");},
      open:async path=>{const p=get(path);p.openedAt=new Date().toISOString();put(p);return{path:p.path,name:p.name,config:p.config}},
      removeRecent:async path=>{writeProjects(readProjects().filter(p=>p.path!==path));return true},
      readTree:async path=>tree(get(path)),
      readFile:async(path,file)=>{const p=get(path);if(!(file in p.files))throw new Error("Fichier introuvable.");return p.files[file]},
      writeFile:async(path,file,content)=>{const p=get(path);p.files[file]=String(content);if(file===".pcn"){try{p.config=JSON.parse(content)}catch{}}put(p);return true},
      createFile:async(path,file)=>{const p=get(path);if(file in p.files)throw new Error("Ce fichier existe déjà.");p.files[file]="";put(p);return true},
      createFolder:async(path,dir)=>{const p=get(path);p.dirs||=[];if(!p.dirs.includes(dir))p.dirs.push(dir);put(p);return true},
      deleteEntry:async()=>true,
      renameEntry:async()=>true,
      readConfig:async path=>copy(get(path).config),
      writeConfig:async(path,cfg)=>{const p=get(path);p.config=copy(cfg);p.files[".pcn"]=JSON.stringify(cfg,null,2)+"\n";put(p);return true}
    },
    terminal:{
      shells:async()=>[{id:"web",label:"BETA Web"}],
      create:async()=>{throw new Error("Le terminal système est uniquement disponible dans CodeNost Desktop.");},
      write:async()=>false,kill:async()=>true,onData:()=>()=>{},onExit:()=>()=>{}
    },
    preview:{
      start:async path=>staticPreview(get(path)),
      stop:async()=>{if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;return true},
      openWindow:async url=>{window.open(url,"_blank","noopener,noreferrer");return true}
    },
    settings:{
      read:async()=>{const d={theme:"dark",fontSize:14,fontFamily:"ui-monospace, SFMono-Regular, Consolas, monospace",autoSave:true,lineNumbers:true,breadcrumbs:true,minimap:false,aiMode:"review",previewAutoReload:true,panel:{explorer:true,ai:true,bottom:true}};try{return{...d,...JSON.parse(localStorage.getItem(SKEY)||"{}")}}catch{return d}},
      write:async s=>{localStorage.setItem(SKEY,JSON.stringify(s));return copy(s)}
    },
    system:{openExternal:async url=>{window.open(url,"_blank","noopener,noreferrer");return true}}
  };
})();