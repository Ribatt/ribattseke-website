/* ===== ADMIN PANEL ===== */
var ADM_NS='lms4_adm_';
var ADM_PIN_KEY=ADM_NS+'pin';
var ADM_CORRECT=btoa('20171125');
var ADM_EMAIL='ribattseke@gmail.com';
var ADM_EMAILS=['ribattseke@gmail.com','ribatt3@gmail.com','60523255@mylife.unisa.ac.za'];


// Legacy IR keys pool (pre-new-format). Admin marks specific ones as issued via ADM_NS.
var LEGACY_IR_KEYS=[
  'TRIAL-A001','TRIAL-A002','TRIAL-A003','TRIAL-A004','TRIAL-A005',
  'TRIAL-B001','TRIAL-B002','TRIAL-B003','TRIAL-B004','TRIAL-B005',
  'TRIAL-C001','TRIAL-C002','TRIAL-C003','TRIAL-C004','TRIAL-C005',
  'TRIAL-D001','TRIAL-D002','TRIAL-D003','TRIAL-D004','TRIAL-D005',
  'TRIAL-E001','TRIAL-E002','TRIAL-E003','TRIAL-E004','TRIAL-E005',
  'VQ-A001','VQ-A002','VQ-A003','VQ-A004','VQ-A005',
  'VQ-B001','VQ-B002','VQ-B003','VQ-B004','VQ-B005',
  'VQ-C001','VQ-C002','VQ-C003','VQ-C004','VQ-C005',
  'VQ-D001','VQ-D002','VQ-D003','VQ-D004','VQ-D005',
  'VQ-E001','VQ-E002','VQ-E003','VQ-E004','VQ-E005',
  'ATVET-2026','AFRICA-2026',
  'RIBA-A001','RIBA-A002','RIBA-A003','RIBA-A004','RIBA-A005',
  'RIBA-B001','RIBA-B002','RIBA-B003','RIBA-B004','RIBA-B005',
  'RIBA-C001','RIBA-C002','RIBA-C003','RIBA-C004','RIBA-C005',
  'RIBA-D001','RIBA-D002','RIBA-D003','RIBA-D004','RIBA-D005',
  'RIBA-E001','RIBA-E002','RIBA-E003','RIBA-E004','RIBA-E005',
  'RIBA-F001','RIBA-F002','RIBA-F003','RIBA-F004','RIBA-F005',
  'RIBA-G001','RIBA-G002','RIBA-G003','RIBA-G004','RIBA-G005',
  'RIBA-H001','RIBA-H002','RIBA-H003','RIBA-H004','RIBA-H005',
  'RIBA-J001','RIBA-J002','RIBA-J003','RIBA-J004','RIBA-J005',
  'RIBA-K001','RIBA-K002','RIBA-K003','RIBA-K004','RIBA-K005'
];
var IR_KEY_NS='biz_ir_issued_';
var ECSA_KEY_NS='biz_ecsa_issued_';

/* ===== RTT 13-CHARACTER KEY GENERATION =====
 * Format: RTT-{I1}{I2}-{H1}{R1}{R2}-{IR|EC}  — always exactly 13 chars
 * I1 = first letter of first name (uppercase)
 * I2 = first letter of second name (uppercase), or "-" if no second name
 * H1 = deterministic char derived from SHA-256-like hash of normalizedEmail+digitsOnlyPhone+"RTT2026"
 * R1,R2 = crypto.getRandomValues — no ambiguous chars (no 0,O,1,I,l)
 * Scope suffix: "IR" (Installation Rules) or "EC" (ECSA Companion)
 *
 * Uniqueness: block duplicate active key for same email+phone+scope in localStorage
 * Validation: reject any key not found in IR_KEY_NS or ECSA_KEY_NS storage
 * Frontend enforces format & localStorage uniqueness; Firestore/backend enforces cross-device uniqueness
 */
var RTT_SAFE_CHARS='ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 chars, no 0/O/1/I/l
var RTT_SALT='RTT2026';

function rttInitials(firstName, secondName){
  var i1=(firstName||'').replace(/[^A-Za-z]/g,'').charAt(0).toUpperCase()||'-';
  var i2=(secondName||'').replace(/[^A-Za-z]/g,'').charAt(0).toUpperCase()||'-';
  return i1+i2;
}

function rttHashChar(email, phone){
  /* Simple deterministic hash → one safe char from RTT_SAFE_CHARS
   * Uses a DJB2-style hash on normalized inputs + salt */
  var s=(email||'').toLowerCase().trim()+(phone||'').replace(/\D/g,'')+RTT_SALT;
  var h=5381;
  for(var i=0;i<s.length;i++){ h=((h<<5)+h)+s.charCodeAt(i); h=h&0x7fffffff; }
  return RTT_SAFE_CHARS[Math.abs(h)%RTT_SAFE_CHARS.length];
}

function rttRandomChars(n){
  var arr=new Uint8Array(n*4);
  crypto.getRandomValues(arr);
  var result='';
  var idx=0;
  while(result.length<n && idx<arr.length){
    var c=RTT_SAFE_CHARS[arr[idx]%RTT_SAFE_CHARS.length];
    result+=c;
    idx++;
  }
  // fallback if somehow short (extremely unlikely)
  while(result.length<n) result+=RTT_SAFE_CHARS[Math.floor(Math.random()*RTT_SAFE_CHARS.length)];
  return result;
}

function rttGenerateKey(firstName, secondName, email, phone, scope, surname){
  /* scope: 'ir' → 'IR', 'ecsa' → 'EC'
   * I1 = first name initial, I2 = surname initial (secondName is middle name, ignored for key) */
  var initials=rttInitials(firstName, surname||secondName);
  var h1=rttHashChar(email, phone);
  var r1r2=rttRandomChars(2);
  var sfx=(scope==='ecsa')?'EC':'IR';
  var key='RTT-'+initials+'-'+h1+r1r2+'-'+sfx;
  /* Verify exactly 13 chars */
  if(key.length!==13){
    console.error('RTT key length error:',key,'length='+key.length);
  }
  return key;
}

function rttIsDuplicateActive(email, phone, scope){
  /* Check localStorage for any active key already issued to same email+phone+scope */
  var ns=(scope==='ecsa')?ECSA_KEY_NS:IR_KEY_NS;
  var normEmail=(email||'').toLowerCase().trim();
  var normPhone=(phone||'').replace(/\D/g,'');
  try{
    for(var i=0;i<localStorage.length;i++){
      var k=localStorage.key(i);
      if(k&&k.indexOf(ns)===0){
        try{
          var v=JSON.parse(localStorage.getItem(k));
          if(v&&v.email&&v.phone){
            if(v.email.toLowerCase().trim()===normEmail && v.phone.replace(/\D/g,'')===normPhone){
              return k.substring(ns.length); // return the existing key
            }
          }
        }catch(e){}
      }
    }
  }catch(e){}
  return null;
}

function rttValidateKey(key){
  /* Returns true if key matches RTT format AND is found in localStorage */
  if(!key||key.length!==13) return false;
  if(!/^RTT-[A-Z\-]{2}-[A-Z2-9]{3}-(IR|EC)$/.test(key)) return false;
  // Also accept legacy RIBA- / Tseke- keys for backwards compat
  var stored=localStorage.getItem(IR_KEY_NS+key)||localStorage.getItem(ECSA_KEY_NS+key)
             ||localStorage.getItem(ADM_NS+'k_'+key);
  return !!stored;
}

function lmsAdminEntry(){
  /* Show email + PIN prompt */
  var old=document.getElementById('lms-adm-pin-overlay');
  if(old) old.parentNode.removeChild(old);
  var ov=document.createElement('div');
  ov.id='lms-adm-pin-overlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center;';
  ov.innerHTML='<div style="background:#1a1a1a;border:1px solid #444;border-radius:12px;padding:28px 24px;width:300px;text-align:center;">'
    +'<p style="color:#ccc;margin:0 0 16px;font-size:15px;font-weight:600;">Admin Access</p>'
    +'<input id="lms-adm-email-inp" type="email" placeholder="Admin email" autocomplete="email" '
    +'style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid #555;background:#111;color:#fff;font-size:14px;margin-bottom:10px;" />'
    +'<div style="position:relative;width:100%;">'
    +'<input id="lms-adm-pin-inp" type="password" placeholder="PIN" autocomplete="off" '
    +'style="width:100%;box-sizing:border-box;padding:10px 40px 10px 12px;border-radius:8px;border:1px solid #555;background:#111;color:#fff;font-size:16px;text-align:center;letter-spacing:4px;" />'
    +'<button type="button" onclick="lmsTogglePinVis()" tabindex="-1" '
    +'style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#aaa;padding:4px;line-height:1;">'
    +'<svg id="lms-pin-eye" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
    +'</button></div>'
    +'<p id="lms-adm-pin-err" style="color:#e55;font-size:12px;margin:8px 0 0;min-height:16px;"></p>'
    +'<div style="display:flex;gap:10px;margin-top:16px;">'
    +'<button onclick="document.getElementById(\'lms-adm-pin-overlay\').remove()" '
    +'style="flex:1;padding:9px;border-radius:8px;border:1px solid #555;background:#222;color:#aaa;cursor:pointer;">Cancel</button>'
    +'<button onclick="lmsAdmPinSubmit()" '
    +'style="flex:1;padding:9px;border-radius:8px;border:none;background:#2a7a4b;color:#fff;cursor:pointer;font-weight:600;">Enter</button>'
    +'</div></div>';
  document.body.appendChild(ov);
  setTimeout(function(){ var inp=document.getElementById('lms-adm-email-inp'); if(inp) inp.focus(); },80);
  /* allow Enter key on PIN field */
  var pinInp=document.getElementById('lms-adm-pin-inp');
  if(pinInp){ pinInp.addEventListener('keydown',function(e){ if(e.key==='Enter') lmsAdmPinSubmit(); }); }
}

function lmsTogglePinVis(){
  var inp=document.getElementById('lms-adm-pin-inp');
  var eye=document.getElementById('lms-pin-eye');
  if(!inp) return;
  if(inp.type==='password'){
    inp.type='text';
    if(eye) eye.innerHTML='<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
  } else {
    inp.type='password';
    if(eye) eye.innerHTML='<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
  }
}

function lmsAdmPinSubmit(){
  var emailInp=document.getElementById('lms-adm-email-inp');
  var inp=document.getElementById('lms-adm-pin-inp');
  var err=document.getElementById('lms-adm-pin-err');
  if(!inp) return;
  var emailVal=(emailInp?emailInp.value:'').trim().toLowerCase();
  var val=(inp.value||'').trim();
  if(!emailVal){ if(err) err.textContent='Please enter your admin email.'; if(emailInp) emailInp.focus(); return; }
  if(ADM_EMAILS.map(function(e){return e.toLowerCase();}).indexOf(emailVal)<0){ if(err) err.textContent='Email not recognised.'; if(emailInp){emailInp.value='';emailInp.focus();} return; }
  if(!val){ if(err) err.textContent='Please enter the PIN.'; inp.focus(); return; }
  if(btoa(val)!==ADM_CORRECT){ if(err) err.textContent='Incorrect PIN. Try again.'; inp.value=''; inp.focus(); return; }
  var ov=document.getElementById('lms-adm-pin-overlay');
  if(ov) ov.remove();
  lmsOpenAdmin();
}

function lmsIssuedKey(k){
  try{return !!localStorage.getItem(ADM_NS+'k_'+k);}catch(e){return false;}
}

function lmsToggleIssued(k){
  if(lmsIssuedKey(k)){
    /* un-issue — just do it, no confirm dialog */
    try{localStorage.removeItem(ADM_NS+'k_'+k);}catch(e){}
    lmsOpenAdmin();
  } else {
    /* show inline note input instead of prompt() */
    var noteId='adm-note-'+k.replace(/[^a-zA-Z0-9]/g,'_');
    var row=document.getElementById('adm-row-'+k.replace(/[^a-zA-Z0-9]/g,'_'));
    if(row){
      var existing=document.getElementById(noteId);
      if(existing){ existing.parentNode.removeChild(existing); return; }
      var inp=document.createElement('div');
      inp.id=noteId;
      inp.style.cssText='margin-top:6px;display:flex;gap:6px;';
      inp.innerHTML='<input id="'+noteId+'-val" type="text" placeholder="Student name or cell" '
        +'style="flex:1;padding:6px 8px;border-radius:6px;border:1px solid #555;background:#111;color:#fff;font-size:13px;" />'
        +'<button onclick="lmsConfirmIssue(\''+k+'\')" style="padding:6px 10px;border-radius:6px;border:none;background:#2a7a4b;color:#fff;cursor:pointer;font-size:12px;">OK</button>'
        +'<button onclick="document.getElementById(\''+noteId+'\').remove()" style="padding:6px 8px;border-radius:6px;border:1px solid #555;background:#222;color:#aaa;cursor:pointer;font-size:12px;">X</button>';
      row.appendChild(inp);
      setTimeout(function(){ var v=document.getElementById(noteId+'-val'); if(v) v.focus(); },40);
    } else {
      /* fallback: mark issued with no note */
      try{localStorage.setItem(ADM_NS+'k_'+k,'(issued)');}catch(e){}
      lmsOpenAdmin();
    }
  }
}

function lmsConfirmIssue(k){
  var noteId='adm-note-'+k.replace(/[^a-zA-Z0-9]/g,'_');
  var inp=document.getElementById(noteId+'-val');
  var who=(inp&&inp.value.trim())||'(issued)';
  try{localStorage.setItem(ADM_NS+'k_'+k,who);}catch(e){}
  lmsOpenAdmin();
}

function admCopy(k){
  if(navigator.clipboard){
    navigator.clipboard.writeText(k).then(function(){
      var el=document.getElementById('adm-copy-'+k);
      if(el){var old=el.textContent;el.textContent='Copied';setTimeout(function(){el.textContent=old;},1500);}
    }).catch(function(){
      var el=document.getElementById('adm-copy-'+k);
      if(el){el.select&&el.select();}
    });
  }
}

function lmsRenderAdmList(containerId, keys){
  var el=document.getElementById(containerId);
  if(!el) return;
  var issued=0;
  var rows=keys.map(function(k){
    var who=null; try{who=localStorage.getItem(ADM_NS+'k_'+k);}catch(e){}
    var isIssued=!!who; if(isIssued) issued++;
    var rowId='adm-row-'+k.replace(/[^a-zA-Z0-9]/g,'_');
    return '<div id="'+rowId+'" style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);font-size:12.5px;flex-wrap:wrap;">'
      +'<code style="flex:1;font-size:12px;">'+k+'</code>'
      +(isIssued?'<span style="color:var(--amb);font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+who+'</span>':'<span style="color:var(--fg3);font-size:11px;flex:1;">available</span>')
      +'<button data-k=\"'+k+'\" onclick=\"admCopy(this.dataset.k)\" style=\"font-size:10px;padding:2px 7px;border:1px solid var(--border);background:var(--bg-alt);border-radius:4px;cursor:pointer;\">Copy</button>'
      +'<button data-k2=\"'+k+'\" onclick=\"lmsToggleIssued(this.dataset.k2)\" style=\"font-size:10px;padding:2px 7px;border:1px solid var(--border);background:var(--bg-alt);border-radius:4px;cursor:pointer;\">'+(isIssued?'Unissue':'Issue')+'</button>'
      +'</div>';
  }).join('');
  el.innerHTML=rows||'<p style="font-size:12px;color:var(--fg3);">No keys in this tier.</p>';
  return {total:keys.length, issued:issued, available:keys.length-issued};
}

function lmsOpenAdmin(){
  // Safety: ensure lmsShowView is available (defined in tab-study.html fragment)
  if(typeof lmsShowView!=='function'){
    setTimeout(lmsOpenAdmin,150);
    return;
  }
  // Restore last active hub section (render if needed)
  setTimeout(function(){
    if(typeof hubRenderers==='function') hubRenderers();
    /* Also force-render whatever hub section is currently visible */
    var activeHub=document.querySelector('#lms-admin .hub-section.active');
    if(activeHub){
      var hid=activeHub.id;
      if(hid==='hub-kyc'&&typeof kycRender==='function')kycRender();
      else if(hid==='hub-expiry'&&typeof expiryRender==='function')expiryRender();
      else if(hid==='hub-financials'&&typeof finRender==='function')finRender();
      else if(hid==='hub-jobs'&&typeof jobRender==='function')jobRender();
      else if(hid==='hub-coc'&&typeof cocRender==='function')cocRender();
      else if(hid==='hub-clients'&&typeof clRender==='function')clRender();
    }
  }, 80);

  // Collect issued keys from localStorage (new Tseke- format)
  var el=function(id){return document.getElementById(id);};
  var irIssued=[]; var ecsaIssued=[];
  try{
    for(var i=0;i<localStorage.length;i++){
      var lk=localStorage.key(i);
      if(lk&&lk.indexOf(IR_KEY_NS)===0){
        var keyStr=lk.substring(IR_KEY_NS.length);
        irIssued.push({key:keyStr,who:localStorage.getItem(lk)});
      } else if(lk&&lk.indexOf(ECSA_KEY_NS)===0){
        var keyStr2=lk.substring(ECSA_KEY_NS.length);
        ecsaIssued.push({key:keyStr2,who:localStorage.getItem(lk)});
      }
    }
  }catch(e){}

  // Also include legacy IR keys that have been marked issued in the old ADM_NS system
  try{
    LEGACY_IR_KEYS.forEach(function(lk2){
      var who2=localStorage.getItem(ADM_NS+'k_'+lk2);
      if(who2){ irIssued.push({key:lk2, who:who2, legacy:true}); }
    });
  }catch(e){}

  // Render IR Companion issued list
  var irList=el('adm-ir-list');
  if(irList){
    if(!irIssued.length){
      irList.innerHTML='<p style="font-size:12px;color:var(--fg3);padding:6px 0;">No IR Companion keys issued yet on this device.</p>';
    } else {
      irList.innerHTML=irIssued.map(function(e){
        return '<div style="padding:5px 0;border-bottom:1px solid var(--border);font-size:12px;"><strong style="font-family:monospace;">'+e.key+'</strong> → '+e.who+'</div>';
      }).join('');
    }
  }
  // Render ECSA Companion issued list
  var ecsaList=el('adm-ecsa-list');
  if(ecsaList){
    if(!ecsaIssued.length){
      ecsaList.innerHTML='<p style="font-size:12px;color:var(--fg3);padding:6px 0;">No ECSA Companion keys issued yet on this device.</p>';
    } else {
      ecsaList.innerHTML=ecsaIssued.map(function(e){
        return '<div style="padding:5px 0;border-bottom:1px solid var(--border);font-size:12px;"><strong style="font-family:monospace;">'+e.key+'</strong> → '+e.who+'</div>';
      }).join('');
    }
  }

  // Render legacy IR key pool section (shows all legacy keys with issue toggle)
  var legacyList=el('adm-legacy-ir-list');
  if(legacyList){
    var lStats=lmsRenderAdmList('adm-legacy-ir-list', LEGACY_IR_KEYS);
    if(el('adm-legacy-ir-ct') && lStats) el('adm-legacy-ir-ct').textContent=lStats.issued+' / '+lStats.total;
  }

  // Update counts
  if(el('adm-ir-ct')) el('adm-ir-ct').textContent=irIssued.length;
  if(el('adm-ecsa-ct')) el('adm-ecsa-ct').textContent=ecsaIssued.length;
  var totalIssued=irIssued.length+ecsaIssued.length;
  if(el('adm-tot-is')) el('adm-tot-is').textContent=totalIssued;

  // Pending registrations from Firebase
  var pendBlock=el('adm-pending-block');
  var pendList=el('adm-pending-list');
  var pendCt=el('adm-pend-ct');
  if(pendBlock&&pendList&&_lmsFbDb){
    _lmsFbDb.collection('users').where('tier','==','pending').get().then(function(snap){
      if(snap.empty){
        pendBlock.style.display='none';
        if(pendCt) pendCt.textContent='0';
        return;
      }
      pendBlock.style.display='block';
      if(pendCt) pendCt.textContent=snap.size;
      var rows=[];
      snap.forEach(function(doc){
        var d=doc.data();
        var joinedStr=d.joinedAt&&d.joinedAt.toDate?d.joinedAt.toDate().toLocaleDateString('en-ZA'):'';
        var safeName=d.username.replace(/[^a-z0-9_-]/gi,'');
        rows.push('<div id="pend-row-'+safeName+'" style="padding:10px 0;border-bottom:1px solid var(--border);">'
          +'<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;">'
          +'<div><strong style="font-size:13px;">'+d.username+'</strong>'
          +(joinedStr?' <span style="color:var(--fg3);font-size:11px;">'+joinedStr+'</span>':'')+'</div>'
          +'<button data-sid="'+safeName+'" data-phone="'+d.phone+'" data-email="'+(d.email||'')+'" data-uname="'+d.username+'" onclick="admShowSendKey(this.dataset.sid,this.dataset.phone,this.dataset.email,this.dataset.uname)"'
          +'style="background:var(--amb);color:#fff;border:none;border-radius:6px;padding:4px 11px;font-size:11px;cursor:pointer;white-space:nowrap;">Send Key</button>'
          +'</div>'
          +'<div style="font-size:12px;color:var(--fg2);">'+d.phone+(d.email?' &middot; '+d.email:'')+'</div>'
          +'<div id="pend-send-'+safeName+'" style="display:none;margin-top:8px;background:var(--bg-alt);border:1px solid var(--border);border-radius:8px;padding:10px;"></div>'
          +'</div>');
      });
      pendList.innerHTML=rows.join('');
    }).catch(function(){
      pendBlock.style.display='none';
    });
  } else if(pendBlock){
    pendBlock.style.display='none';
  }

  lmsShowView('lms-admin');
}

function admShowSendKey(safeId, phone, email, username){
  var box=document.getElementById('pend-send-'+safeId);
  if(!box) return;
  if(box.style.display==='block'){box.style.display='none';return;}

  // Parse username into first/second name for RTT initials
  var parts=(username||'').trim().split(/\s+/);
  var fn=parts[0]||'';
  var sn=parts.length>1?parts[1]:'';

  // Auto-generate RTT-13 key
  var autoKey=rttGenerateKey(fn, sn, email||'', phone||'', 'ir');

  box.innerHTML=
    '<div style="font-size:11.5px;font-weight:700;margin-bottom:8px;">Generate &amp; send key to '+esc(username)+'</div>'
    +'<div style="margin-bottom:8px;">'
    +'<div style="display:flex;gap:8px;margin-bottom:6px;">'
    +'<div style="flex:1;">'
    +'<label style="font-size:10px;color:var(--fg3);display:block;margin-bottom:2px;">First name (for initials)</label>'
    +'<input id="adm-fn-'+safeId+'" type="text" value="'+esc(fn)+'" placeholder="First" style="width:100%;box-sizing:border-box;padding:5px 7px;border:1px solid var(--border);border-radius:5px;background:var(--bg);color:var(--fg);font-size:12px;" oninput="admRegenKey(\''+safeId+'\',\''+esc(email||'')+'\',\''+esc(phone||'')+'\')">'
    +'</div>'
    +'<div style="flex:1;">'
    +'<label style="font-size:10px;color:var(--fg3);display:block;margin-bottom:2px;">Second name (optional)</label>'
    +'<input id="adm-sn-'+safeId+'" type="text" value="'+esc(sn)+'" placeholder="Second or leave blank" style="width:100%;box-sizing:border-box;padding:5px 7px;border:1px solid var(--border);border-radius:5px;background:var(--bg);color:var(--fg);font-size:12px;" oninput="admRegenKey(\''+safeId+'\',\''+esc(email||'')+'\',\''+esc(phone||'')+'\')">'
    +'</div>'
    +'</div>'
    +'<label style="font-size:11px;color:var(--fg2);display:block;margin-bottom:3px;">Key type</label>'
    +'<div style="display:flex;gap:12px;margin-bottom:8px;">'
    +'<label style="font-size:12px;cursor:pointer;"><input type="radio" name="adm-kt-'+safeId+'" value="ir" checked style="margin-right:4px;" onchange="admRegenKey(\''+safeId+'\',\''+esc(email||'')+'\',\''+esc(phone||'')+'\')">IR Companion</label>'
    +'<label style="font-size:12px;cursor:pointer;"><input type="radio" name="adm-kt-'+safeId+'" value="ecsa" style="margin-right:4px;" onchange="admRegenKey(\''+safeId+'\',\''+esc(email||'')+'\',\''+esc(phone||'')+'\')">ECSA Companion</label>'
    +'</div>'
    +'<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">'
    +'<label style="font-size:11px;color:var(--fg2);flex:1;">Generated key (13 chars — edit only if needed)</label>'
    +'<button onclick="admRegenKey(\''+safeId+'\',\''+esc(email||'')+'\',\''+esc(phone||'')+'\')" style="font-size:11px;padding:3px 8px;background:var(--bg-alt);border:1px solid var(--border);border-radius:4px;cursor:pointer;color:var(--fg2);">↻ Regenerate</button>'
    +'</div>'
    +'<input id="adm-key-inp-'+safeId+'" type="text" value="'+autoKey+'" style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid var(--amb);border-radius:6px;background:var(--bg);color:var(--fg);font-size:13px;font-family:monospace;font-weight:700;letter-spacing:1px;margin-bottom:4px;">'
    +'<div id="adm-key-warn-'+safeId+'" style="font-size:10.5px;color:var(--fg3);margin-bottom:8px;">RTT-{I1}{I2}-{H1}{R1}{R2}-IR/EC — always 13 characters</div>'
    +'</div>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap;">'
    +'<button data-sid="'+safeId+'" data-phone="'+esc(phone||'')+'" data-email="'+esc(email||'')+'" data-uname="'+esc(username)+'" onclick="admDoSendKey(this.dataset.sid,this.dataset.phone,this.dataset.email,this.dataset.uname)" style="flex:1;background:#25D366;color:#fff;border:none;border-radius:6px;padding:7px 10px;font-size:12px;cursor:pointer;min-width:120px;">WhatsApp</button>'
    +(email?'<button data-sid2="'+safeId+'" data-email2="'+esc(email)+'" data-uname2="'+esc(username)+'" onclick="admDoSendEmail(this.dataset.sid2,this.dataset.email2,this.dataset.uname2)" style="flex:1;background:#1a73e8;color:#fff;border:none;border-radius:6px;padding:7px 10px;font-size:12px;cursor:pointer;min-width:120px;">Email</button>':'')
    +'</div>';
  box.style.display='block';
}

function admRegenKey(safeId, email, phone){
  var fn=(document.getElementById('adm-fn-'+safeId)||{}).value||'';
  var sn=(document.getElementById('adm-sn-'+safeId)||{}).value||'';
  var scope=admGetKeyType(safeId);
  // Check for existing active key
  var existing=rttIsDuplicateActive(email, phone, scope);
  var warn=document.getElementById('adm-key-warn-'+safeId);
  var inp=document.getElementById('adm-key-inp-'+safeId);
  if(existing && existing.length===13){
    if(inp) inp.value=existing;
    if(warn) warn.innerHTML='<span style="color:#e67e22;">⚠ Active key already exists for this email+phone. Using existing key.</span>';
  } else {
    var newKey=rttGenerateKey(fn, sn, email, phone, scope);
    if(inp) inp.value=newKey;
    if(warn) warn.innerHTML='<span style="color:var(--fg3);">RTT-{I1}{I2}-{H1}{R1}{R2}-'+((scope==='ecsa')?'EC':'IR')+' — 13 chars ✓</span>';
  }
}

function admGetSelectedKey(safeId){
  var inp=document.getElementById('adm-key-inp-'+safeId);
  return inp?inp.value.trim():null;
}

function admGetKeyType(safeId){
  var radios=document.querySelectorAll('input[name="adm-kt-'+safeId+'"]');
  for(var i=0;i<radios.length;i++){
    if(radios[i].checked) return radios[i].value; // 'ir' or 'ecsa'
  }
  return 'ir';
}

function admDoSendKey(safeId, phone, email, username){
  var key=admGetSelectedKey(safeId);
  if(!key){alert('No key entered.');return;}
  var keyType=admGetKeyType(safeId); // 'ir' or 'ecsa'
  // Validate RTT-13 format (also accept legacy RIBA-/Tseke- for backwards compat)
  var isRTT=/^RTT-[A-Z\-]{2}-[A-Z2-9]{3}-(IR|EC)$/.test(key);
  var isLegacy=/^(RIBA-[A-Z]\d{3}|Tseke-\d{10}-\d{8})$/i.test(key);
  if(!isRTT && !isLegacy){
    alert('Key format must be RTT-{I1}{I2}-{H1}{R1}{R2}-{IR|EC}\nExample: RTT-TS-A9K-IR\n\nUse the auto-generate button to create a valid key.');
    return;
  }
  // Mark as issued in localStorage (so lmsCheckKey can resolve it on student device via admin's device)
  // Store rich object for duplicate detection
  var ns=keyType==='ecsa'?ECSA_KEY_NS:IR_KEY_NS;
  try{
    var keyRec={who:username,phone:(phone||''),email:(email||''),issuedAt:Date.now(),scope:keyType};
    localStorage.setItem(ns+key, JSON.stringify(keyRec));
  }catch(e){}
  // Invoice details
  var invAmt=keyType==='ecsa'?0:1000; // ECSA is by quote
  var companionLabel=keyType==='ecsa'?'ECSA Companion':'IR Companion';
  var invId='INV-'+Date.now()+'-'+(username||'').substring(0,6).toUpperCase();
  var invDate=new Date();
  var invDateStr=invDate.toLocaleDateString('en-ZA',{day:'2-digit',month:'long',year:'numeric'});
  var inv={
    id:invId, username:username, phone:phone, email:email,
    key:key, type:keyType, amount:invAmt, currency:'ZAR',
    date:invDate.toISOString(), dateStr:invDateStr,
    description:'Installation Rules LMS — '+companionLabel+' Access Key',
    status:'issued', issuedBy:'Riba T Tseke', issuedTo:username
  };
  bizSet('inv_'+invId, inv);
  bizSet('inv_user_'+username, invId);
  // WhatsApp message
  var amtLine=invAmt>0?'\nInvoice reference: '+invId+' — R'+invAmt:'';
  var msg='Hi '+username+',\n\nYour '+companionLabel+' access key is:\n\n*'+key+'*'+amtLine+'\n\nSteps to activate:\n1. Go to ribattseke.co.za\n2. Click the Study tab\n3. Sign in with your username and PIN\n4. Enter the key above when prompted\n\nFor support WhatsApp Tseke: 072 474 8888';
  var num=phone.replace(/\s/g,'').replace(/^0/,'27').replace(/^\+/,'');
  window.open('https://wa.me/'+num+'?text='+encodeURIComponent(msg),'_blank');
  // Firebase recording
  if(_lmsFbDb){
    try{
      _lmsFbDb.collection('keys').doc(key).set({claimed:true,type:keyType,claimedBy:username,claimedPhone:phone,claimedEmail:email,claimedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
      _lmsFbDb.collection('users').doc(username).update({keyReserved:key,keyType:keyType,keyReservedAt:firebase.firestore.FieldValue.serverTimestamp(),invoiceId:invId,invoiceAmount:invAmt}).catch(function(){});
      _lmsFbDb.collection('invoices').doc(invId).set(inv).catch(function(){});
    }catch(e){}
  }
  setTimeout(lmsOpenAdmin, 500);
}

function admDoSendEmail(safeId, email, username){
  var key=admGetSelectedKey(safeId);
  if(!key){alert('No key entered.');return;}
  var keyType=admGetKeyType(safeId);
  var companionLabel=keyType==='ecsa'?'ECSA Companion':'IR Companion';
  var subj='Your '+companionLabel+' LMS Access Key';
  var body='Hi '+username+',\n\nYour '+companionLabel+' LMS access key is:\n\n'+key+'\n\nSteps to activate:\n1. Go to ribattseke.co.za\n2. Click the Study tab\n3. Sign in with your username and PIN\n4. Enter the key above when prompted\n\nFor support contact Tseke: 072 474 8888 or ribattseke@gmail.com\n\nRegards,\nRiba T Tseke';
  window.location.href='mailto:'+email+'?subject='+encodeURIComponent(subj)+'&body='+encodeURIComponent(body);
}

/* ===== FIREBASE INTEGRATION (lazy-loaded on Study tab) ===== */
var _lmsPhone = null;
var _lmsEmail = null;
var _lmsFbDb = null;
var _fbLoaded = false;
var _fbLoading = false;
var _fbCallbacks = [];

function _initFirebaseApp(){
  try{
    var fbConfig = {
      apiKey: "AIzaSyA2dqoAc6ugjVazW4YIAqxDUsqHeUcCAo0",
      authDomain: "fir-config-552cc.firebaseapp.com",
      projectId: "fir-config-552cc",
      storageBucket: "fir-config-552cc.firebasestorage.app",
      messagingSenderId: "656750326751",
      appId: "1:656750326751:web:588eeb8c380a64361aca6a",
      measurementId: "G-7P7LP32JBQ"
    };
    if(typeof firebase === 'undefined') return;
    if(!firebase.apps.length) firebase.initializeApp(fbConfig);
    _lmsFbDb = firebase.firestore();
    _fbLoaded = true;
    _fbLoading = false;
    _fbCallbacks.forEach(function(cb){ try{ cb(); }catch(e){} });
    _fbCallbacks = [];
  }catch(e){ _fbLoading = false; }
}

function _loadFirebase(cb){
  if(_fbLoaded){ if(cb) cb(); return; }
  if(cb) _fbCallbacks.push(cb);
  if(_fbLoading) return;
  _fbLoading = true;
  var s1 = document.createElement('script');
  s1.src = 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js';
  s1.onload = function(){
    var s2 = document.createElement('script');
    s2.src = 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore-compat.js';
    s2.onload = _initFirebaseApp;
    s2.onerror = function(){ _fbLoading = false; };
    document.head.appendChild(s2);
  };
  s1.onerror = function(){ _fbLoading = false; };
  document.head.appendChild(s1);
}

function lmsFirebaseRegister(username, phone, email, tier, key){
  if(!_lmsFbDb) return;
  try{
    var now = firebase.firestore.FieldValue.serverTimestamp();
    // Register user — email and phone both stored for recovery reassignment
    _lmsFbDb.collection('users').doc(username).set({
      username: username, phone: phone, email: email, tier: tier, key: key,
      joinedAt: now, lastSeen: now, sessionsPassed: 0
    }, {merge: true});
    // Mark key as claimed; store both identifiers so admin can reassign
    _lmsFbDb.collection('keys').doc(key).set({
      claimed: true, claimedBy: username, claimedPhone: phone, claimedEmail: email, claimedAt: now
    }, {merge: true});
  }catch(e){}
}

function lmsFirebaseLogActivity(username, phone, paper, sessIdx, score, passed){
  if(!_lmsFbDb) return;
  try{
    var subjectMap = {p1:'SANS 10142-1 Paper 1',p2:'SANS 10142-1 Paper 2',eir1:'EIR 1992',eir2:'Construction Regs 2003',s101981:'SANS 10198-1 & 10198-2 — Power Cable Selection',s10292:'SANS 10292 — Earthing & SANS 1973-3 — LV Switchgear Assemblies',s10313:'SANS 10313 — Lightning Protection of Structures'};
    _lmsFbDb.collection('activity').add({
      username: username, phone: phone, email: _lmsEmail||'',
      paper: paper, session: sessIdx,
      sessionTitle: subjectMap[paper]||paper,
      score: score, passed: passed,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    // Update lastSeen and sessionsPassed
    _lmsFbDb.collection('users').doc(username).update({
      lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
      sessionsPassed: passed ? firebase.firestore.FieldValue.increment(1) : firebase.firestore.FieldValue.increment(0)
    }).catch(function(){});
  }catch(e){}
}


/* =====================================================
   RIBA T TSEKE COMPANY HUB — Phase 1: Clients, Quotes, LOI, Invoices
   All data in localStorage under biz_ namespace
   ===================================================== */

var BIZ_NS = 'biz_';

/* ---- Missing global helpers ---- */
function closeModal(id){
  var el=document.getElementById(id);
  if(el) el.remove();
  /* also remove any .biz-modal-bg overlay */
  document.querySelectorAll('.biz-modal-bg').forEach(function(o){ o.remove(); });
}

function lmsSignOut(){
  if(typeof lmsLogout==='function') lmsLogout();
}

function cocCheckerOpen(id){
  /* Opens CoC checker — navigate to CoC section and optionally load record */
  if(typeof hubShow==='function') hubShow('hub-coc');
  if(id && typeof cocEdit==='function') setTimeout(function(){ cocEdit(id); }, 100);
}

/* ---- Storage helpers ---- */
function bizGet(key){ try{ return JSON.parse(localStorage.getItem(BIZ_NS+key)||'null'); }catch(e){ return null; } }
function bizSet(key,val){ try{ localStorage.setItem(BIZ_NS+key,JSON.stringify(val)); }catch(e){} }
function bizList(prefix){
  var out=[];
  try{
    for(var i=0;i<localStorage.length;i++){
      var k=localStorage.key(i);
      if(k && k.indexOf(BIZ_NS+prefix)===0){
        try{ out.push(JSON.parse(localStorage.getItem(k))); }catch(e){}
      }
    }
  }catch(e){}
  out.sort(function(a,b){ return (b.createdAt||0)-(a.createdAt||0); });
  return out;
}
function bizDel(key){ try{ localStorage.removeItem(BIZ_NS+key); }catch(e){} }

/* ---- Seed factory data (clients + issued keys) — written once, never overwritten ---- */
(function _seedFactory(){
  /* Clients */
  var SEED_CLIENTS=[
    {id:'cl_keletso_manoto',name:'Keletso Manoto',company:'',phone:'',email:'',address:'',vat:'',notes:'',createdAt:1700000000000},
  ];
  SEED_CLIENTS.forEach(function(c){
    if(!localStorage.getItem(BIZ_NS+'cl_'+c.id.replace(/^cl_/,''))){
      try{ localStorage.setItem(BIZ_NS+'cl_'+c.id.replace(/^cl_/,''),JSON.stringify(c)); }catch(e){}
    }
  });
  /* Issued keys — write to both old ADM_NS and new IR_KEY_NS so they show in every list view */
  var SEED_KEYS=[
    {key:'RIBA-A001', who:'Tseke Riba', ns:'legacy'},
    {key:'RIBA-A002', who:'Tiaan',      ns:'legacy'},
  ];
  SEED_KEYS.forEach(function(sk){
    if(sk.ns==='legacy'){
      var lk=ADM_NS+'k_'+sk.key;
      if(!localStorage.getItem(lk)){ try{ localStorage.setItem(lk,sk.who); }catch(e){} }
    } else {
      var irk=IR_KEY_NS+sk.key;
      if(!localStorage.getItem(irk)){ try{ localStorage.setItem(irk,sk.who); }catch(e){} }
    }
  });
})();

/* ---- ID generators ---- */
function bizNextSeq(type){
  var n=(bizGet('seq_'+type)||0)+1;
  bizSet('seq_'+type,n);
  return n;
}
/* bizSeq is an alias kept for backward compat */
function bizSeq(type){return bizNextSeq(type);}
/* doPrintDoc — appends a direct body child so @media print CSS works reliably */
function doPrintDoc(html,title){
  var old=document.getElementById('_biz_pn');if(old&&old.parentNode)old.parentNode.removeChild(old);
  var el=document.createElement('div');el.id='_biz_pn';el.innerHTML=html;
  document.body.appendChild(el);
  var prevTitle=document.title;
  if(title)document.title=title;
  window.print();
  setTimeout(function(){
    var n=document.getElementById('_biz_pn');if(n&&n.parentNode)n.parentNode.removeChild(n);
    document.title=prevTitle;
  },3500);
}
function padN(n,len){ var s=String(n); while(s.length<len) s='0'+s; return s; }
function bizDateStr(ts){ var d=new Date(ts||Date.now()); return d.getFullYear()+'-'+padN(d.getMonth()+1,2)+'-'+padN(d.getDate(),2); }
/* Global helpers used by admin modals */
function val(id){ var el=document.getElementById(id); return el?(el.value||''):''; }
function today(){ return new Date().toISOString().split('T')[0]; }

/* ---- Hub nav ---- */
function hubShow(id,btn){
  document.querySelectorAll('.hub-section').forEach(function(s){ s.classList.remove('active'); s.style.display=''; });
  document.querySelectorAll('.hub-nav-btn').forEach(function(b){ b.classList.remove('active'); });
  var sec=document.getElementById(id);
  if(sec){ sec.classList.add('active'); sec.style.display='block'; }
  if(btn) btn.classList.add('active');
  if(id==='hub-clients') clRender();
  if(id==='hub-quotes') qtRender();
  if(id==='hub-loi') loiRender();
  if(id==='hub-agr') agrRender();
  if(id==='hub-invoices') invRender();
}

/* ===========================================
   CLIENTS
   =========================================== */
function clRender(){
  var q=(document.getElementById('cl-search')||{}).value||'';
  var list=bizList('cl_');
  if(q) list=list.filter(function(c){ return (c.name+c.phone+c.email+c.company).toLowerCase().indexOf(q.toLowerCase())>-1; });
  var el=document.getElementById('cl-list');
  if(!el) return;
  if(!list.length){ el.innerHTML='<p style="font-size:13px;color:var(--fg3);text-align:center;padding:20px 0;">No clients yet. Add your first client.</p>'; return; }
  el.innerHTML=list.map(function(c){
    var qtCount=bizList('qt_').filter(function(q){ return q.clientId===c.id; }).length;
    var invCount=bizList('inv_').filter(function(i){ return i.clientId===c.id; }).length;
    return '<div class="biz-card">'
      +'<div class="biz-card-row">'
      +'<div><div class="biz-card-title">'+esc(c.name)+(c.company?' &mdash; <span style="font-weight:400;font-size:12px;">'+esc(c.company)+'</span>':'')+'</div>'
      +'<div class="biz-card-sub">'+esc(c.phone)+(c.email?' &middot; '+esc(c.email):'')+(c.address?' &middot; '+esc(c.address):'')+'</div></div>'
      +'<div style="display:flex;gap:5px;flex-shrink:0;">'
      +'<span class="biz-badge biz-badge-blue">'+qtCount+' quote'+(qtCount===1?'':'s')+'</span>'
      +'<span class="biz-badge biz-badge-green">'+invCount+' inv</span>'
      +'</div></div>'
      +'<div class="biz-card-actions">'
      +'<button class="biz-btn biz-btn-secondary" onclick="clEdit(\''+c.id+'\')">Edit</button>'
      +'<button class="biz-btn biz-btn-primary" onclick="qtNew(\''+c.id+'\')">New Quote</button>'
      +'<button class="biz-btn biz-btn-danger" onclick="clDel(\''+c.id+'\')">Delete</button>'
      +'</div></div>';
  }).join('');
}

function clNew(){ clOpenModal(null); }
function clEdit(id){ clOpenModal(bizGet('cl_'+id)); }
function clDel(id){
  var c=bizGet('cl_'+id);
  if(!c) return;
  var ov=document.createElement('div');
  ov.className='biz-modal-bg';
  ov.innerHTML='<div class="biz-modal"><h4>Delete Client</h4><p style="font-size:13.5px;color:var(--fg2);">Delete <strong>'+esc(c.name)+'</strong>? This cannot be undone.</p>'
    +'<div class="biz-modal-actions">'
    +'<button class="biz-btn biz-btn-danger" onclick="bizDel(\'cl_'+id+'\');this.closest(\'.biz-modal-bg\').remove();clRender();">Delete</button>'
    +'<button class="biz-btn biz-btn-secondary" onclick="this.closest(\'.biz-modal-bg\').remove()">Cancel</button>'
    +'</div></div>';
  document.body.appendChild(ov);
}

function clOpenModal(c){
  var isNew=!c;
  c=c||{id:'cl_'+Date.now(),name:'',company:'',phone:'',email:'',address:'',vat:'',notes:'',createdAt:Date.now()};
  var ov=document.createElement('div');
  ov.className='biz-modal-bg';
  ov.id='cl-modal';
  ov.innerHTML='<div class="biz-modal">'
    +'<h4>'+(isNew?'New Client':'Edit Client')+'</h4>'
    +'<div class="biz-field"><label class="biz-label">Full Name *</label><input class="biz-input" id="cl-f-name" value="'+esc(c.name)+'"></div>'
    +'<div class="biz-field"><label class="biz-label">Company / Organisation</label><input class="biz-input" id="cl-f-company" value="'+esc(c.company||'')+'"></div>'
    +'<div class="biz-field"><label class="biz-label">Phone / WhatsApp *</label><input class="biz-input" id="cl-f-phone" type="tel" value="'+esc(c.phone)+'"></div>'
    +'<div class="biz-field"><label class="biz-label">Email</label><input class="biz-input" id="cl-f-email" type="email" value="'+esc(c.email||'')+'"></div>'
    +'<div class="biz-field"><label class="biz-label">Site / Delivery Address</label><textarea class="biz-textarea" id="cl-f-address">'+esc(c.address||'')+'</textarea></div>'
    +'<div class="biz-field"><label class="biz-label">VAT Number</label><input class="biz-input" id="cl-f-vat" value="'+esc(c.vat||'')+'"></div>'
    +'<div class="biz-field"><label class="biz-label">Notes</label><textarea class="biz-textarea" id="cl-f-notes">'+esc(c.notes||'')+'</textarea></div>'
    +'<p id="cl-modal-err" style="color:#e55;font-size:12px;min-height:14px;"></p>'
    +'<div class="biz-modal-actions">'
    +'<button class="biz-btn biz-btn-primary" onclick="clSave(\''+c.id+'\')">Save</button>'
    +'<button class="biz-btn biz-btn-secondary" onclick="document.getElementById(\'cl-modal\').remove()">Cancel</button>'
    +'</div></div>';
  document.body.appendChild(ov);
}

function clSave(id){
  var name=(document.getElementById('cl-f-name').value||'').trim();
  var phone=(document.getElementById('cl-f-phone').value||'').trim();
  if(!name||!phone){ document.getElementById('cl-modal-err').textContent='Name and phone are required.'; return; }
  var existing=bizGet('cl_'+id)||{id:'cl_'+id,createdAt:Date.now()};
  existing.name=name;
  existing.company=(document.getElementById('cl-f-company').value||'').trim();
  existing.phone=phone;
  existing.email=(document.getElementById('cl-f-email').value||'').trim();
  existing.address=(document.getElementById('cl-f-address').value||'').trim();
  existing.vat=(document.getElementById('cl-f-vat').value||'').trim();
  existing.notes=(document.getElementById('cl-f-notes').value||'').trim();
  bizSet('cl_'+id,existing);
  document.getElementById('cl-modal').remove();
  clRender();
}

/* ===========================================
   QUOTES
   =========================================== */
var QT_TEMPLATES = {
  coc: {name:'Certificate of Compliance (CoC)', items:[
    {desc:'CoC Inspection (single-phase residential)',qty:1,unit:'Each',rate:850},
    {desc:'CoC Inspection (three-phase residential)',qty:1,unit:'Each',rate:1200},
    {desc:'Additional circuits',qty:0,unit:'No.',rate:120},
    {desc:'Travel (Gauteng)',qty:1,unit:'Allow',rate:350}
  ]},
  training: {name:'Training Panel Construction', items:[
    {desc:'Phenolic board (supply and prepare)',qty:1,unit:'Each',rate:0},
    {desc:'Electrical components (supply)',qty:1,unit:'Allow',rate:0},
    {desc:'Assembly, wiring and testing',qty:1,unit:'Allow',rate:0},
    {desc:'Delivery (Gauteng)',qty:1,unit:'Allow',rate:500}
  ]},
  general: {name:'General Electrical Installation / Repair', items:[
    {desc:'Labour (call-out + first hour)',qty:1,unit:'Allow',rate:650},
    {desc:'Additional hours',qty:0,unit:'Hours',rate:450},
    {desc:'Materials',qty:1,unit:'Allow',rate:0},
    {desc:'Travel (Gauteng)',qty:1,unit:'Allow',rate:350}
  ]}
};

/* ===========================================
   RATE CARD DATA + HELPERS
   =========================================== */
var BIZ_RATE_DEFAULTS = {
  labour: [
    {id:'ie',    role:'Installation Electrician (IE)',   hourly:420,  basis:'DOL/NBCEI gazette + professional margin'},
    {id:'senior',role:'Senior IE / Charge Hand',         hourly:520,  basis:'DOL/NBCEI gazette + seniority margin'},
    {id:'appr',  role:'Apprentice / Learner',            hourly:220,  basis:'NBCEI learner rate + levy portion'},
    {id:'pm',    role:'Project Manager',                 hourly:580,  basis:'Professional rate — project risk and oversight'},
    {id:'admin', role:'Admin / Office Support',          hourly:195,  basis:'DOL Domestic Worker & Clerical Sectoral Determination floor + margin'},
    {id:'sales', role:'Sales & Marketing',               hourly:280,  basis:'Allocated cost per deal — canvassing, proposal prep, follow-up'},
    {id:'finance',role:'Finance & Invoicing',            hourly:220,  basis:'Bookkeeping/accounting cost allocation per job'},
    {id:'safety',role:'Safety Officer / Supervisor',     hourly:350,  basis:'OHS Act s16(2) appointee rate — high-risk site overhead'}
  ],
  travel: { aaRatePerKm:4.84, margin:1.20 },
  books: [
    {id:'10142-hc', name:'SANS 10142-1 (Ed 3.3) Hardcopy',    sellPrice:1900,   paystack:'https://paystack.com/buy/sans-10142-1-2026-edition-33-hardcopy-levwkw'},
    {id:'10142-sc', name:'SANS 10142-1 (Ed 3.3) Softcopy PDF', sellPrice:1478.26,paystack:'https://paystack.com/buy/sans-10142-1-2026-edition-303-softcopy-pdf-tviglk'},
    {id:'10292-hc', name:'SANS 10292 Hardcopy',                sellPrice:1200,   paystack:''},
    {id:'10292-sc', name:'SANS 10292 Softcopy PDF',            sellPrice:917.28, paystack:''},
    {id:'10198-1-hc',name:'SANS 10198-1 Hardcopy',            sellPrice:500,    paystack:''},
    {id:'10198-1-sc',name:'SANS 10198-1 Softcopy PDF',        sellPrice:415.80, paystack:''},
    {id:'10198-2-hc',name:'SANS 10198-2 Hardcopy',            sellPrice:1100,   paystack:''},
    {id:'10198-2-sc',name:'SANS 10198-2 Softcopy PDF',        sellPrice:874.44, paystack:''},
    {id:'10313-hc', name:'SANS 10313 Hardcopy',                sellPrice:800,    paystack:''},
    {id:'10313-sc', name:'SANS 10313 Softcopy PDF',            sellPrice:616.15, paystack:''},
    {id:'1507-1-hc',name:'SANS 1507-1 Hardcopy',              sellPrice:700,    paystack:''},
    {id:'1507-1-sc',name:'SANS 1507-1 Softcopy PDF',          sellPrice:530.45, paystack:''},
    {id:'1973-3-hc',name:'SANS 1973-3 Hardcopy',              sellPrice:1000,   paystack:''},
    {id:'1973-3-sc',name:'SANS 1973-3 Softcopy PDF',          sellPrice:773.65, paystack:''}
  ],
  report:   { compilationHourly:280 },
  insurance:{ ratePercent:2.5 },
  overhead: { projectAlloc:85, monthlyBreakdown:'Claude AI R500 + Memberships R150 + Software R200 = R850/month ÷ ~10 jobs' },
  nbcei: {
    headElectrician:  { wage:160.59, description:'Head Electrician (NBCEI Wage)' },
    assistant:        { wage:74.95,  description:'Electrical Assistant (NBCEI Wage)' }
  },
  coc: {
    fee:        2500,
    teamDayRate:6206.95,
    teamNote:   'Team of 4 (Head Elec + 3 Assistants) × 8h day — includes NBCEI wages + overhead'
  }
};
function bizGetRates(){
  try{
    var s=bizGet('rates_v1');
    if(s&&s.labour){
      // Merge in any new default roles not in saved data
      var saved_ids=s.labour.map(function(r){return r.id;});
      BIZ_RATE_DEFAULTS.labour.forEach(function(def){
        if(saved_ids.indexOf(def.id)<0) s.labour.push(JSON.parse(JSON.stringify(def)));
      });
      if(!s.nbcei) s.nbcei=JSON.parse(JSON.stringify(BIZ_RATE_DEFAULTS.nbcei));
      if(!s.coc)   s.coc  =JSON.parse(JSON.stringify(BIZ_RATE_DEFAULTS.coc));
      // Merge in any new default books not in saved data
      if(!s.books) s.books=[];
      var saved_bids=s.books.map(function(b){return b.id;});
      BIZ_RATE_DEFAULTS.books.forEach(function(def){
        if(saved_bids.indexOf(def.id)<0) s.books.push(JSON.parse(JSON.stringify(def)));
      });
      return s;
    }
  }catch(e){}
  return JSON.parse(JSON.stringify(BIZ_RATE_DEFAULTS));
}
function bizSaveRates(r){ bizSet('rates_v1',r); }

function qtQaToggle(){
  var p=document.getElementById('qt-qa-panel');
  if(!p) return;
  p.style.display=(p.style.display==='none'||!p.style.display?'block':'none');
}
function qtQaPanelHtml(){
  return '<div style="font-size:12px;font-weight:700;color:#1E8540;margin-bottom:8px;">⚡ Quick Add from Rate Card</div>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start;">'
    +'<div><label style="font-size:11px;color:#666;display:block;margin-bottom:3px;">Category</label>'
    +'<select id="qt-qa-cat" class="biz-input" style="min-width:150px;font-size:12px;" onchange="qtQaCatChg()">'
    +'<option value="">Select...</option>'
    +'<option value="labour">Labour</option>'
    +'<option value="travel">Travel (AA Rate)</option>'
    +'<option value="tolls">Toll Gates</option>'
    +'<option value="book">Books / Study Material</option>'
    +'<option value="report">Report Compilation</option>'
    +'<option value="insurance">Insurance Provision</option>'
    +'<option value="overhead">Overhead Allocation</option>'
    +'<option value="nbcei">NBCEI Labour (wage rate)</option>'
    +'<option value="coc">COC Fee</option>'
    +'<option value="consumable">Consumable / Material</option>'
    +'</select></div>'
    +'<div id="qt-qa-fields" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;"></div>'
    +'</div>'
    +'<div id="qt-qa-preview" style="font-size:11px;color:#1E8540;font-style:italic;margin:6px 0 2px;min-height:16px;"></div>'
    +'<div style="display:flex;gap:6px;margin-top:6px;">'
    +'<button class="biz-btn biz-btn-primary" style="font-size:11px;" onclick="qtQaAdd()">+ Add to Quote</button>'
    +'<button class="biz-btn biz-btn-secondary" style="font-size:11px;" onclick="qtQaToggle()">Close</button>'
    +'</div>';
}
function qtQaCatChg(){
  var cat=(document.getElementById('qt-qa-cat')||{}).value||'';
  var R=bizGetRates();
  var f=document.getElementById('qt-qa-fields');
  if(!f) return;
  function lbl(t){ return '<label style="font-size:11px;color:#666;display:block;margin-bottom:2px;">'+t+'</label>'; }
  var html='';
  if(cat==='labour'){
    var roleOpts=R.labour.map(function(r){ return '<option value="'+r.id+'">'+r.role+'</option>'; }).join('');
    html='<div>'+lbl('Role')+'<select id="qt-qa-role" class="biz-input" style="font-size:12px;" onchange="qtQaPreview()">'+roleOpts+'</select></div>'
      +'<div>'+lbl('Hours')+'<input id="qt-qa-hours" class="biz-input" type="number" value="4" min="0.5" step="0.5" style="width:70px;" oninput="qtQaPreview()"></div>'
      +'<div>'+lbl('Workers')+'<input id="qt-qa-workers" class="biz-input" type="number" value="1" min="1" style="width:60px;" oninput="qtQaPreview()"></div>';
  } else if(cat==='travel'){
    html='<div>'+lbl('Distance km (one-way)')+'<input id="qt-qa-km" class="biz-input" type="number" value="0" min="0" style="width:80px;" oninput="qtQaPreview()"></div>'
      +'<div>'+lbl('Trips (2=return)')+'<input id="qt-qa-trips" class="biz-input" type="number" value="2" min="1" style="width:60px;" oninput="qtQaPreview()"></div>';
  } else if(cat==='tolls'){
    html='<div>'+lbl('Route description')+'<input id="qt-qa-tollroute" class="biz-input" value="" placeholder="e.g. N1 Allandale return" style="width:200px;"></div>'
      +'<div>'+lbl('Toll amount (R)')+'<input id="qt-qa-tollamt" class="biz-input" type="number" value="0" min="0" style="width:80px;" oninput="qtQaPreview()"></div>';
  } else if(cat==='book'){
    var bookOpts=R.books.map(function(b){ return '<option value="'+b.id+'">'+b.name+' — R'+b.sellPrice+'</option>'; }).join('');
    html='<div>'+lbl('Title')+'<select id="qt-qa-book" class="biz-input" style="font-size:12px;" onchange="qtQaPreview()">'+bookOpts+'</select></div>'
      +'<div>'+lbl('Qty')+'<input id="qt-qa-bookqty" class="biz-input" type="number" value="1" min="1" style="width:60px;" oninput="qtQaPreview()"></div>';
  } else if(cat==='report'){
    html='<div>'+lbl('Hours')+'<input id="qt-qa-rephours" class="biz-input" type="number" value="2" min="0.5" step="0.5" style="width:80px;" oninput="qtQaPreview()"></div>'
      +'<div>'+lbl('Description')+'<input id="qt-qa-repdesc" class="biz-input" value="Report Compilation &amp; Submission" style="width:200px;"></div>';
  } else if(cat==='insurance'){
    html='<div>'+lbl('Project subtotal (R)')+'<input id="qt-qa-insbase" class="biz-input" type="number" value="0" min="0" style="width:100px;" oninput="qtQaPreview()"></div>'
      +'<div>'+lbl('Rate (%)')+'<input id="qt-qa-insrate" class="biz-input" type="number" value="'+R.insurance.ratePercent+'" min="0.1" step="0.1" style="width:70px;" oninput="qtQaPreview()"></div>';
  } else if(cat==='overhead'){
    html='<div style="font-size:11px;color:#555;max-width:280px;">Adds project overhead: R'+R.overhead.projectAlloc+'/project<br><span style="color:#888;font-size:10px;">'+esc(R.overhead.monthlyBreakdown)+'</span></div>';
  } else if(cat==='nbcei'){
    var nb=R.nbcei||BIZ_RATE_DEFAULTS.nbcei;
    html='<div>'+lbl('Role')+'<select id="qt-qa-nrole" class="biz-input" style="font-size:12px;" onchange="qtQaPreview()">'
      +'<option value="he">Head Electrician (R'+nb.headElectrician.wage+'/h)</option>'
      +'<option value="asst">Assistant (R'+nb.assistant.wage+'/h)</option>'
      +'</select></div>'
      +'<div>'+lbl('Hours')+'<input id="qt-qa-nhours" class="biz-input" type="number" value="8" min="1" step="0.5" style="width:70px;" oninput="qtQaPreview()"></div>'
      +'<div>'+lbl('Workers')+'<input id="qt-qa-nworkers" class="biz-input" type="number" value="1" min="1" style="width:60px;" oninput="qtQaPreview()"></div>';
  } else if(cat==='coc'){
    var cc=R.coc||BIZ_RATE_DEFAULTS.coc;
    html='<div style="font-size:11px;color:#555;max-width:300px;">COC issuance fee: <strong>R'+fmtMoney(cc.fee)+'</strong><br>Team day rate: <strong>R'+fmtMoney(cc.teamDayRate)+'</strong><br><span style="color:#888;font-size:10px;">'+esc(cc.teamNote)+'</span></div>'
      +'<div>'+lbl('Use')+'<select id="qt-qa-coctype" class="biz-input" style="font-size:12px;" onchange="qtQaPreview()">'
      +'<option value="fee">COC Fee only</option>'
      +'<option value="day">Team Day Rate</option>'
      +'</select></div>'
      +'<div id="qt-qa-cocdays-wrap">'+lbl('Days')+'<input id="qt-qa-cocdays" class="biz-input" type="number" value="1" min="1" style="width:60px;" oninput="qtQaPreview()"></div>';
  } else if(cat==='consumable'){
    html='<div>'+lbl('Description')+'<input id="qt-qa-consdesc" class="biz-input" placeholder="e.g. 2.5mm² XLPE cable" style="width:180px;"></div>'
      +'<div>'+lbl('Qty')+'<input id="qt-qa-consqty" class="biz-input" type="number" value="1" min="0" step="any" style="width:70px;"></div>'
      +'<div>'+lbl('Unit')+'<input id="qt-qa-consunit" class="biz-input" value="m" style="width:60px;"></div>'
      +'<div>'+lbl('Rate (R)')+'<input id="qt-qa-consrate" class="biz-input" type="number" value="0" min="0" style="width:80px;" oninput="qtQaPreview()"></div>';
  }
  f.innerHTML=html;
  qtQaPreview();
}
function qtQaPreview(){
  var cat=(document.getElementById('qt-qa-cat')||{}).value||'';
  var R=bizGetRates();
  var prev=document.getElementById('qt-qa-preview');
  if(!prev) return;
  var txt='';
  try{
    if(cat==='labour'){
      var rid=(document.getElementById('qt-qa-role')||{}).value;
      var ro=R.labour.filter(function(r){return r.id===rid;})[0]||R.labour[0];
      var h=parseFloat((document.getElementById('qt-qa-hours')||{}).value)||0;
      var w=parseInt((document.getElementById('qt-qa-workers')||{}).value)||1;
      txt=ro.role+': '+w+' × '+h+'h × R'+ro.hourly+'/h = R'+fmtMoney(h*ro.hourly*w);
    } else if(cat==='travel'){
      var km=parseFloat((document.getElementById('qt-qa-km')||{}).value)||0;
      var tr2=parseInt((document.getElementById('qt-qa-trips')||{}).value)||1;
      var tkm=km*tr2;
      var rk=Math.round(R.travel.aaRatePerKm*R.travel.margin*100)/100;
      txt=tkm+'km ('+km+'×'+tr2+' trips) × R'+R.travel.aaRatePerKm+'/km × '+R.travel.margin+' = R'+fmtMoney(tkm*rk);
    } else if(cat==='tolls'){
      var ta=parseFloat((document.getElementById('qt-qa-tollamt')||{}).value)||0;
      txt='Toll: R'+fmtMoney(ta)+' (actual cost — no margin)';
    } else if(cat==='book'){
      var bid=(document.getElementById('qt-qa-book')||{}).value;
      var bo=R.books.filter(function(b){return b.id===bid;})[0]||R.books[0];
      var bq=parseInt((document.getElementById('qt-qa-bookqty')||{}).value)||1;
      txt=bo.name+' × '+bq+' = R'+fmtMoney(bo.sellPrice*bq);
    } else if(cat==='report'){
      var rh=parseFloat((document.getElementById('qt-qa-rephours')||{}).value)||0;
      txt='Report: '+rh+'h × R'+R.report.compilationHourly+'/h = R'+fmtMoney(rh*R.report.compilationHourly);
    } else if(cat==='insurance'){
      var ib=parseFloat((document.getElementById('qt-qa-insbase')||{}).value)||0;
      var ip=parseFloat((document.getElementById('qt-qa-insrate')||{}).value)||R.insurance.ratePercent;
      txt='Insurance: R'+fmtMoney(ib)+' × '+ip+'% = R'+fmtMoney(ib*ip/100);
    } else if(cat==='overhead'){
      txt='Overhead: R'+R.overhead.projectAlloc+'/project (AI + memberships + software)';
    } else if(cat==='nbcei'){
      var nb=R.nbcei||BIZ_RATE_DEFAULTS.nbcei;
      var nr=(document.getElementById('qt-qa-nrole')||{}).value||'he';
      var nw=parseFloat((document.getElementById('qt-qa-nhours')||{}).value)||8;
      var nwk=parseInt((document.getElementById('qt-qa-nworkers')||{}).value)||1;
      var nrate=nr==='he'?nb.headElectrician.wage:nb.assistant.wage;
      var nrole=nr==='he'?'Head Electrician':'Assistant';
      txt='NBCEI '+nrole+': '+nwk+'×'+nw+'h × R'+nrate+'/h = R'+fmtMoney(nw*nrate*nwk);
    } else if(cat==='coc'){
      var cc=R.coc||BIZ_RATE_DEFAULTS.coc;
      var ctype=(document.getElementById('qt-qa-coctype')||{}).value||'fee';
      if(ctype==='fee'){
        txt='COC Fee: R'+fmtMoney(cc.fee)+' (disbursement)';
      } else {
        var days=parseFloat((document.getElementById('qt-qa-cocdays')||{}).value)||1;
        txt='Team Day Rate × '+days+' day(s) = R'+fmtMoney(cc.teamDayRate*days);
      }
    } else if(cat==='consumable'){
      var cq=parseFloat((document.getElementById('qt-qa-consqty')||{}).value)||1;
      var cr=parseFloat((document.getElementById('qt-qa-consrate')||{}).value)||0;
      txt='Total: R'+fmtMoney(cq*cr);
    }
  }catch(e){}
  prev.textContent=txt;
}
function qtQaAdd(){
  var cat=(document.getElementById('qt-qa-cat')||{}).value||'';
  if(!cat) return;
  var R=bizGetRates();
  var item=null;
  try{
    if(cat==='labour'){
      var rid=(document.getElementById('qt-qa-role')||{}).value;
      var ro=R.labour.filter(function(r){return r.id===rid;})[0]||R.labour[0];
      var h=parseFloat((document.getElementById('qt-qa-hours')||{}).value)||1;
      var w=parseInt((document.getElementById('qt-qa-workers')||{}).value)||1;
      item={desc:'Labour — '+ro.role+(w>1?' (×'+w+' workers)':''),qty:h,unit:'Hours',rate:ro.hourly*w,
            basis:w+' worker(s) × '+h+'h × R'+ro.hourly+'/h (DoL/ECA rate + margin)'};
    } else if(cat==='travel'){
      var km=parseFloat((document.getElementById('qt-qa-km')||{}).value)||0;
      var trips=parseInt((document.getElementById('qt-qa-trips')||{}).value)||1;
      var tkm=km*trips;
      var rk=Math.round(R.travel.aaRatePerKm*R.travel.margin*100)/100;
      item={desc:'Travel — '+tkm+'km ('+km+'km × '+trips+' trip'+(trips>1?'s':'')+' return)',qty:tkm,unit:'km',rate:rk,
            basis:'SARS 2024/25 AA rate R'+R.travel.aaRatePerKm+'/km × '+R.travel.margin+' margin = R'+rk+'/km; covers fuel, wear & depreciation'};
    } else if(cat==='tolls'){
      var route=(document.getElementById('qt-qa-tollroute')||{}).value||'Tolls';
      var ta=parseFloat((document.getElementById('qt-qa-tollamt')||{}).value)||0;
      item={desc:'Toll Gates — '+route,qty:1,unit:'Allow',rate:ta,basis:'Actual toll cost — no margin applied'};
    } else if(cat==='book'){
      var bid=(document.getElementById('qt-qa-book')||{}).value;
      var bo=R.books.filter(function(b){return b.id===bid;})[0]||R.books[0];
      var bq=parseInt((document.getElementById('qt-qa-bookqty')||{}).value)||1;
      item={desc:'Study Material — '+bo.name,qty:bq,unit:'Each',rate:bo.sellPrice,
            basis:'Paystack sell price R'+bo.sellPrice+(bo.paystack?' — order via: '+bo.paystack:'')};
    } else if(cat==='report'){
      var rh=parseFloat((document.getElementById('qt-qa-rephours')||{}).value)||1;
      var rd=(document.getElementById('qt-qa-repdesc')||{}).value||'Report Compilation & Submission';
      item={desc:rd,qty:rh,unit:'Hours',rate:R.report.compilationHourly,
            basis:rh+'h × R'+R.report.compilationHourly+'/h (AI-assisted, reviewed & signed off by IE — covers Claude AI + professional time)'};
    } else if(cat==='insurance'){
      var ib=parseFloat((document.getElementById('qt-qa-insbase')||{}).value)||0;
      var ip=parseFloat((document.getElementById('qt-qa-insrate')||{}).value)||R.insurance.ratePercent;
      var iamt=Math.round(ib*ip/100*100)/100;
      item={desc:'Professional Indemnity & Liability Insurance',qty:1,unit:'Allow',rate:iamt,
            basis:'PI + PL insurance: '+ip+'% of R'+fmtMoney(ib)+' project value (annual premium allocation)'};
    } else if(cat==='overhead'){
      item={desc:'Overhead Allocation (AI, Memberships, Software)',qty:1,unit:'Allow',rate:R.overhead.projectAlloc,
            basis:R.overhead.monthlyBreakdown};
    } else if(cat==='nbcei'){
      var nb=R.nbcei||BIZ_RATE_DEFAULTS.nbcei;
      var nr=(document.getElementById('qt-qa-nrole')||{}).value||'he';
      var nh=parseFloat((document.getElementById('qt-qa-nhours')||{}).value)||8;
      var nwk=parseInt((document.getElementById('qt-qa-nworkers')||{}).value)||1;
      var nrate=nr==='he'?nb.headElectrician.wage:nb.assistant.wage;
      var nrole=nr==='he'?nb.headElectrician.description:nb.assistant.description;
      item={desc:'Labour (NBCEI) — '+nrole+(nwk>1?' ×'+nwk:''),qty:nh,unit:'Hours',rate:nrate*nwk,
            basis:nwk+' × '+nh+'h × R'+nrate+'/h (NBCEI minimum wage — NBCEI gazette rate)'};
    } else if(cat==='coc'){
      var cc=R.coc||BIZ_RATE_DEFAULTS.coc;
      var ctype=(document.getElementById('qt-qa-coctype')||{}).value||'fee';
      if(ctype==='fee'){
        item={desc:'Certificate of Compliance (COC) — Issuance Fee',qty:1,unit:'Allow',rate:cc.fee,
              basis:'DOL/SANS 10142-1 COC registration & issuance fee (disbursement)'};
      } else {
        var days=parseFloat((document.getElementById('qt-qa-cocdays')||{}).value)||1;
        item={desc:'COC Inspection — Team Day Rate',qty:days,unit:'Day',rate:cc.teamDayRate,
              basis:cc.teamNote};
      }
    } else if(cat==='consumable'){
      var cd=(document.getElementById('qt-qa-consdesc')||{}).value||'Consumable';
      var cq=parseFloat((document.getElementById('qt-qa-consqty')||{}).value)||1;
      var cu=(document.getElementById('qt-qa-consunit')||{}).value||'Each';
      var cr=parseFloat((document.getElementById('qt-qa-consrate')||{}).value)||0;
      item={desc:cd,qty:cq,unit:cu,rate:cr,basis:'Voltex / Liteglo / Key Electrical pricing'};
    }
  }catch(e){}
  if(item){ qtAddRow(item); }
}

/* ===========================================
   RATE CARD ADMIN
   =========================================== */
function ratesRender(){
  var el=document.getElementById('rates-panel');
  if(!el) return;
  var R=bizGetRates();
  var labRows=R.labour.map(function(r,i){
    return '<tr><td style="padding:4px 8px;font-size:12px;">'+esc(r.role)
      +(r.basis?'<br><span style="font-size:10px;color:var(--fg3);">'+esc(r.basis)+'</span>':'')+'</td>'
      +'<td style="padding:4px 8px;"><input type="number" value="'+r.hourly+'" min="0" step="10" style="width:80px;border:1px solid var(--border);border-radius:4px;padding:3px 6px;font-size:12px;background:var(--bg);color:var(--fg);" onchange="ratesUpdateLabour('+i+',this.value)"></td>'
      +'<td style="padding:4px 8px;font-size:11px;color:var(--fg3);">R/hour</td></tr>';
  }).join('');
  var bookRows=R.books.map(function(b,i){
    return '<tr><td style="padding:4px 8px;font-size:12px;">'+esc(b.name)+'</td>'
      +'<td style="padding:4px 8px;"><input type="number" value="'+b.sellPrice+'" min="0" step="50" style="width:90px;border:1px solid var(--border);border-radius:4px;padding:3px 6px;font-size:12px;background:var(--bg);color:var(--fg);" onchange="ratesUpdateBook('+i+',this.value)"></td>'
      +'<td style="padding:4px 8px;">'+(b.paystack?'<a href="'+b.paystack+'" target="_blank" style="color:var(--amb);font-size:11px;text-decoration:none;">Paystack ↗</a>':'-')+'</td></tr>';
  }).join('');
  el.innerHTML='<div style="display:flex;gap:18px;flex-wrap:wrap;">'
    +'<div style="flex:1;min-width:260px;">'
    +'<div style="font-size:12px;font-weight:700;margin-bottom:8px;color:var(--amb);">Labour Rates</div>'
    +'<table style="border-collapse:collapse;width:100%;"><thead><tr>'
    +'<th style="text-align:left;font-size:11px;color:var(--fg3);padding:3px 8px;">Role</th>'
    +'<th style="text-align:left;font-size:11px;color:var(--fg3);padding:3px 8px;">R/h</th>'
    +'<th></th></tr></thead><tbody>'+labRows+'</tbody></table>'
    +'<div style="margin-top:12px;">'
    +'<div style="font-size:12px;font-weight:700;margin-bottom:6px;color:var(--amb);">Travel (AA Rate)</div>'
    +'<div style="font-size:12px;display:flex;gap:12px;flex-wrap:wrap;">'
    +'<div>R/km: <input type="number" id="rates-aa-km" value="'+R.travel.aaRatePerKm+'" step="0.01" min="0" style="width:70px;border:1px solid var(--border);border-radius:4px;padding:3px 6px;font-size:12px;background:var(--bg);color:var(--fg);" onchange="ratesSave()"></div>'
    +'<div>Margin ×: <input type="number" id="rates-aa-margin" value="'+R.travel.margin+'" step="0.05" min="1" style="width:70px;border:1px solid var(--border);border-radius:4px;padding:3px 6px;font-size:12px;background:var(--bg);color:var(--fg);" onchange="ratesSave()"></div>'
    +'</div><div style="font-size:11px;color:var(--fg3);margin-top:4px;">AA rate covers petrol, wear &amp; depreciation — no separate fuel line needed.</div>'
    +'</div>'
    +'<div style="margin-top:12px;">'
    +'<div style="font-size:12px;font-weight:700;margin-bottom:6px;color:var(--amb);">Report / Admin &amp; Overhead</div>'
    +'<div style="font-size:12px;display:flex;gap:12px;flex-wrap:wrap;">'
    +'<div>Report R/h: <input type="number" id="rates-rep-hr" value="'+R.report.compilationHourly+'" step="10" min="0" style="width:80px;border:1px solid var(--border);border-radius:4px;padding:3px 6px;font-size:12px;background:var(--bg);color:var(--fg);" onchange="ratesSave()"></div>'
    +'<div>Insurance %: <input type="number" id="rates-ins-pct" value="'+R.insurance.ratePercent+'" step="0.5" min="0" style="width:70px;border:1px solid var(--border);border-radius:4px;padding:3px 6px;font-size:12px;background:var(--bg);color:var(--fg);" onchange="ratesSave()"></div>'
    +'<div>Overhead/job R: <input type="number" id="rates-oh-job" value="'+R.overhead.projectAlloc+'" step="10" min="0" style="width:70px;border:1px solid var(--border);border-radius:4px;padding:3px 6px;font-size:12px;background:var(--bg);color:var(--fg);" onchange="ratesSave()"></div>'
    +'</div><div style="font-size:11px;color:var(--fg3);margin-top:4px;">'+esc(R.overhead.monthlyBreakdown)+'</div>'
    +'</div>'
    +'</div>'
    +'<div style="flex:1;min-width:260px;">'
    +'<div style="font-size:12px;font-weight:700;margin-bottom:8px;color:var(--amb);">Books / Study Material</div>'
    +'<table style="border-collapse:collapse;width:100%;"><thead><tr>'
    +'<th style="text-align:left;font-size:11px;color:var(--fg3);padding:3px 8px;">Title</th>'
    +'<th style="text-align:left;font-size:11px;color:var(--fg3);padding:3px 8px;">Sell Price</th>'
    +'<th style="text-align:left;font-size:11px;color:var(--fg3);padding:3px 8px;">Order Link</th>'
    +'</tr></thead><tbody>'+bookRows+'</tbody></table>'
    +'<div style="margin-top:12px;font-size:11px;color:var(--fg3);">Changes auto-save instantly. These rates power the ⚡ Quick Add panel when building quotes.</div>'
    +'</div>'
    +'</div>'
    +'<div style="margin-top:18px;border-top:1px solid var(--border);padding-top:14px;display:flex;gap:18px;flex-wrap:wrap;">'
    +'<div style="flex:1;min-width:260px;">'
    +'<div style="font-size:12px;font-weight:700;margin-bottom:8px;color:var(--amb);">NBCEI Wage Rates</div>'
    +'<table style="border-collapse:collapse;width:100%;"><thead><tr>'
    +'<th style="text-align:left;font-size:11px;color:var(--fg3);padding:3px 8px;">Role</th>'
    +'<th style="text-align:left;font-size:11px;color:var(--fg3);padding:3px 8px;">R/h (wage)</th>'
    +'<th></th></tr></thead><tbody>'
    +'<tr><td style="padding:4px 8px;font-size:12px;">'+esc(R.nbcei.headElectrician.description)+'</td>'
    +'<td style="padding:4px 8px;"><input type="number" id="rates-nbcei-he" value="'+R.nbcei.headElectrician.wage+'" min="0" step="0.01" style="width:90px;border:1px solid var(--border);border-radius:4px;padding:3px 6px;font-size:12px;background:var(--bg);color:var(--fg);" onchange="ratesSave()"></td>'
    +'<td style="padding:4px 8px;font-size:11px;color:var(--fg3);">NBCEI minimum</td></tr>'
    +'<tr><td style="padding:4px 8px;font-size:12px;">'+esc(R.nbcei.assistant.description)+'</td>'
    +'<td style="padding:4px 8px;"><input type="number" id="rates-nbcei-asst" value="'+R.nbcei.assistant.wage+'" min="0" step="0.01" style="width:90px;border:1px solid var(--border);border-radius:4px;padding:3px 6px;font-size:12px;background:var(--bg);color:var(--fg);" onchange="ratesSave()"></td>'
    +'<td style="padding:4px 8px;font-size:11px;color:var(--fg3);">NBCEI minimum</td></tr>'
    +'</tbody></table>'
    +'<div style="font-size:11px;color:var(--fg3);margin-top:6px;">NBCEI = National Bargaining Council for Electrical Industry. These are legislated minimum wages — update each year after NBCEI gazette.</div>'
    +'</div>'
    +'<div style="flex:1;min-width:260px;">'
    +'<div style="font-size:12px;font-weight:700;margin-bottom:8px;color:var(--amb);">COC &amp; Team Pricing</div>'
    +'<div style="font-size:12px;display:flex;gap:12px;flex-wrap:wrap;">'
    +'<div>COC Fee (R): <input type="number" id="rates-coc-fee" value="'+R.coc.fee+'" min="0" step="50" style="width:90px;border:1px solid var(--border);border-radius:4px;padding:3px 6px;font-size:12px;background:var(--bg);color:var(--fg);" onchange="ratesSave()"></div>'
    +'<div>Team Day Rate (R): <input type="number" id="rates-coc-tdr" value="'+R.coc.teamDayRate+'" min="0" step="10" style="width:110px;border:1px solid var(--border);border-radius:4px;padding:3px 6px;font-size:12px;background:var(--bg);color:var(--fg);" onchange="ratesSave()"></div>'
    +'</div>'
    +'<div style="font-size:11px;color:var(--fg3);margin-top:6px;">'+esc(R.coc.teamNote)+'</div>'
    +'<div style="font-size:11px;color:var(--fg3);margin-top:4px;"><strong>COC fee basis:</strong> SANS 10142-1 Regulation 6.5 requires a licensed IE (OHS Act Reg 7) to test, sign and register the CoC. The R2,500 covers (1) on-site inspection/testing time, (2) AREP/ECA(SA) registration overhead, (3) full portfolio of evidence (test report, Annexure 1, Form PR2), (4) professional indemnity allocation, and (5) admin and filing. Disbursement to DOL if applicable is in addition.</div>'
    +'<div style="margin-top:10px;padding:8px 10px;background:var(--bg2,rgba(30,133,64,0.08));border-radius:6px;border:1px solid var(--border);">'
    +'<div style="font-size:11px;font-weight:700;color:var(--amb);margin-bottom:4px;">COC Team Day Breakdown</div>'
    +'<div style="font-size:11px;color:var(--fg2);">Head Electrician (8h): R'+(R.nbcei.headElectrician.wage*8).toFixed(2)+'</div>'
    +'<div style="font-size:11px;color:var(--fg2);">3 × Assistants (8h): R'+(R.nbcei.assistant.wage*8*3).toFixed(2)+'</div>'
    +'<div style="font-size:11px;color:var(--fg2);">COC Fee (disbursement): R'+fmtMoney(R.coc.fee)+'</div>'
    +'<div style="font-size:11px;font-weight:700;color:var(--amb);margin-top:4px;border-top:1px solid var(--border);padding-top:4px;">Team Day Rate: R'+fmtMoney(R.coc.teamDayRate)+'</div>'
    +'</div>'
    +'</div>'
    +'</div>';
}
function ratesUpdateLabour(i,val){
  var R=bizGetRates(); if(R.labour[i]){ R.labour[i].hourly=parseFloat(val)||0; if(!R.labour[i].basis&&BIZ_RATE_DEFAULTS.labour[i]) R.labour[i].basis=BIZ_RATE_DEFAULTS.labour[i].basis; } bizSaveRates(R);
}
function ratesUpdateBook(i,val){
  var R=bizGetRates(); if(R.books[i]) R.books[i].sellPrice=parseFloat(val)||0; bizSaveRates(R);
}
function ratesSave(){
  var R=bizGetRates();
  var v=function(id,def){ var el=document.getElementById(id); return el?parseFloat(el.value)||def:def; };
  R.travel.aaRatePerKm=v('rates-aa-km',4.84);
  R.travel.margin=v('rates-aa-margin',1.20);
  R.report.compilationHourly=v('rates-rep-hr',280);
  R.insurance.ratePercent=v('rates-ins-pct',2.5);
  R.overhead.projectAlloc=v('rates-oh-job',85);
  if(!R.nbcei) R.nbcei=JSON.parse(JSON.stringify(BIZ_RATE_DEFAULTS.nbcei));
  if(!R.coc)   R.coc  =JSON.parse(JSON.stringify(BIZ_RATE_DEFAULTS.coc));
  R.nbcei.headElectrician.wage=v('rates-nbcei-he',160.59);
  R.nbcei.assistant.wage=v('rates-nbcei-asst',74.95);
  R.coc.fee=v('rates-coc-fee',2500);
  R.coc.teamDayRate=v('rates-coc-tdr',6206.95);
  bizSaveRates(R);
}

function qtRender(){
  var q=(document.getElementById('qt-search')||{}).value||'';
  var list=bizList('qt_');
  if(q) list=list.filter(function(x){ return (x.quoteNo+''+x.clientName+x.serviceType).toLowerCase().indexOf(q.toLowerCase())>-1; });
  var el=document.getElementById('qt-list');
  if(!el) return;
  if(!list.length){ el.innerHTML='<p style="font-size:13px;color:var(--fg3);text-align:center;padding:20px 0;">No quotes yet.</p>'; return; }
  el.innerHTML=list.map(function(q){
    var statusBadge={'draft':'biz-badge-grey','sent':'biz-badge-blue','accepted':'biz-badge-green','declined':'biz-badge-red'}[q.status]||'biz-badge-grey';
    return '<div class="biz-card">'
      +'<div class="biz-card-row">'
      +'<div><div class="biz-card-title">QT-'+padN(q.seq,4)+' &mdash; '+esc(q.clientName||'No client')+'</div>'
      +'<div class="biz-card-sub">'+esc(q.serviceType||'')+(q.siteAddress?' &middot; '+esc(q.siteAddress):'')+'</div>'
      +'<div class="biz-card-sub" style="margin-top:2px;">'+bizDateStr(q.createdAt)+' &middot; <strong>R'+fmtMoney(q.total)+'</strong></div></div>'
      +'<span class="biz-badge '+statusBadge+'">'+q.status+'</span>'
      +'</div>'
      +'<div class="biz-card-actions">'
      +'<button class="biz-btn biz-btn-secondary" onclick="qtEdit(\''+q.id+'\')">Edit</button>'
      +'<button class="biz-btn biz-btn-primary" onclick="qtPrint(\''+q.id+'\')">Print / PDF</button>'
      +'<button class="biz-btn biz-btn-secondary" onclick="loiFromQt(\''+q.id+'\')">Create LOI</button>'
      +'<button class="biz-btn biz-btn-secondary" onclick="invFromQt(\''+q.id+'\')">Create Invoice</button>'
      +'<button class="biz-btn biz-btn-danger" onclick="bizDelConfirm(\'qt_'+q.id+'\',qtRender)">Del</button>'
      +'</div></div>';
  }).join('');
}

function qtNew(preClientId){
  var clients=bizList('cl_');
  var clOpts=clients.map(function(c){ return '<option value="'+c.id+'"'+(preClientId===c.id?' selected':'')+'>'+esc(c.name)+(c.company?' ('+esc(c.company)+')':'')+'</option>'; }).join('');
  var tmplOpts=Object.keys(QT_TEMPLATES).map(function(k){ return '<option value="'+k+'">'+QT_TEMPLATES[k].name+'</option>'; }).join('');
  var seq=bizNextSeq('qt');
  var ov=document.createElement('div');
  ov.className='biz-modal-bg';
  ov.id='qt-modal';
  ov.innerHTML='<div class="biz-modal">'
    +'<h4>New Quote &mdash; QT-'+padN(seq,4)+'</h4>'
    +'<div class="biz-field"><label class="biz-label">Client *</label>'
    +'<select class="biz-input" id="qt-f-client">'+(clOpts||'<option value="">-- No clients, add one first --</option>')+'</select></div>'
    +'<div class="biz-field"><label class="biz-label">Load Template</label>'
    +'<select class="biz-input" id="qt-f-tmpl" onchange="qtLoadTmpl()"><option value="">-- Custom (blank) --</option>'+tmplOpts+'</select></div>'
    +'<div class="biz-field"><label class="biz-label">Service / Project Description *</label><input class="biz-input" id="qt-f-service" placeholder="e.g. CoC Inspection — 14 Elm Street Sandton"></div>'
    +'<div class="biz-field"><label class="biz-label">Site Address</label><input class="biz-input" id="qt-f-site"></div>'
    +'<div class="biz-field"><label class="biz-label">Valid Until</label><input class="biz-input" id="qt-f-valid" type="date"></div>'
    +'<div class="biz-field"><label class="biz-label">Line Items</label>'
    +'<table class="li-table" id="qt-li-table">'
    +'<thead><tr><th style="width:40%">Description</th><th style="width:10%">Qty</th><th style="width:14%">Unit</th><th style="width:16%">Rate (R)</th><th style="width:14%">Amount</th><th></th></tr></thead>'
    +'<tbody id="qt-li-body"></tbody></table>'
    +'<div style="display:flex;gap:6px;margin-top:5px;flex-wrap:wrap;">'
    +'<button class="biz-btn biz-btn-secondary" style="font-size:11px;" onclick="qtAddRow()">+ Row</button>'
    +'<button class="biz-btn biz-btn-secondary" style="font-size:11px;background:#e8f4ed;color:#1E8540;border-color:#1E8540;" onclick="qtQaToggle()">⚡ Quick Add</button>'
    +'</div>'
    +'<div id="qt-qa-panel" style="display:none;background:#f0f7f3;border:1px solid #c3dfc9;border-radius:8px;padding:12px;margin-top:8px;">'
    +qtQaPanelHtml()
    +'</div></div>'
    +'<div class="li-totals" id="qt-totals"></div>'
    +'<div class="biz-field"><label class="biz-label">VAT</label>'
    +'<select class="biz-input" id="qt-f-vat" onchange="qtCalc()"><option value="0">No VAT (0%)</option><option value="15">Include VAT (15%)</option></select></div>'
    +'<div class="biz-field"><label class="biz-label">Notes / Inclusions</label><textarea class="biz-textarea" id="qt-f-notes" placeholder="e.g. Includes all materials. Work to be completed within 5 working days."></textarea></div>'
    +'<div class="biz-field"><label class="biz-label">Status</label>'
    +'<select class="biz-input" id="qt-f-status"><option value="draft">Draft</option><option value="sent">Sent</option><option value="accepted">Accepted</option><option value="declined">Declined</option></select></div>'
    +'<p id="qt-modal-err" style="color:#e55;font-size:12px;min-height:14px;"></p>'
    +'<div class="biz-modal-actions">'
    +'<button class="biz-btn biz-btn-primary" onclick="qtSave(null,'+seq+')">Save Quote</button>'
    +'<button class="biz-btn biz-btn-secondary" onclick="document.getElementById(\'qt-modal\').remove()">Cancel</button>'
    +'</div></div>';
  document.body.appendChild(ov);
  qtAddRow(); qtCalc();
}

function qtEdit(id){
  var q=bizGet('qt_'+id);
  if(!q) return;
  var clients=bizList('cl_');
  var clOpts=clients.map(function(c){ return '<option value="'+c.id+'"'+(q.clientId===c.id?' selected':'')+'>'+esc(c.name)+(c.company?' ('+esc(c.company)+')':'')+'</option>'; }).join('');
  var ov=document.createElement('div');
  ov.className='biz-modal-bg';
  ov.id='qt-modal';
  ov.innerHTML='<div class="biz-modal">'
    +'<h4>Edit Quote &mdash; QT-'+padN(q.seq,4)+'</h4>'
    +'<div class="biz-field"><label class="biz-label">Client</label>'
    +'<select class="biz-input" id="qt-f-client">'+clOpts+'</select></div>'
    +'<div class="biz-field"><label class="biz-label">Service / Project Description *</label><input class="biz-input" id="qt-f-service" value="'+esc(q.serviceType||'')+'"></div>'
    +'<div class="biz-field"><label class="biz-label">Site Address</label><input class="biz-input" id="qt-f-site" value="'+esc(q.siteAddress||'')+'"></div>'
    +'<div class="biz-field"><label class="biz-label">Valid Until</label><input class="biz-input" id="qt-f-valid" type="date" value="'+esc(q.validUntil||'')+'"></div>'
    +'<div class="biz-field"><label class="biz-label">Line Items</label>'
    +'<table class="li-table" id="qt-li-table">'
    +'<thead><tr><th style="width:40%">Description</th><th style="width:10%">Qty</th><th style="width:14%">Unit</th><th style="width:16%">Rate (R)</th><th style="width:14%">Amount</th><th></th></tr></thead>'
    +'<tbody id="qt-li-body"></tbody></table>'
    +'<div style="display:flex;gap:6px;margin-top:5px;flex-wrap:wrap;">'
    +'<button class="biz-btn biz-btn-secondary" style="font-size:11px;" onclick="qtAddRow()">+ Row</button>'
    +'<button class="biz-btn biz-btn-secondary" style="font-size:11px;background:#e8f4ed;color:#1E8540;border-color:#1E8540;" onclick="qtQaToggle()">⚡ Quick Add</button>'
    +'</div>'
    +'<div id="qt-qa-panel" style="display:none;background:#f0f7f3;border:1px solid #c3dfc9;border-radius:8px;padding:12px;margin-top:8px;">'
    +qtQaPanelHtml()
    +'</div></div>'
    +'<div class="li-totals" id="qt-totals"></div>'
    +'<div class="biz-field"><label class="biz-label">VAT</label>'
    +'<select class="biz-input" id="qt-f-vat" onchange="qtCalc()"><option value="0"'+((!q.vatRate||q.vatRate===0)?' selected':'')+'>No VAT (0%)</option><option value="15"'+(q.vatRate===15?' selected':'')+'>Include VAT (15%)</option></select></div>'
    +'<div class="biz-field"><label class="biz-label">Notes / Inclusions</label><textarea class="biz-textarea" id="qt-f-notes">'+esc(q.notes||'')+'</textarea></div>'
    +'<div class="biz-field"><label class="biz-label">Status</label>'
    +'<select class="biz-input" id="qt-f-status">'
    +['draft','sent','accepted','declined'].map(function(s){ return '<option value="'+s+'"'+(q.status===s?' selected':'')+'>'+s+'</option>'; }).join('')
    +'</select></div>'
    +'<p id="qt-modal-err" style="color:#e55;font-size:12px;min-height:14px;"></p>'
    +'<div class="biz-modal-actions">'
    +'<button class="biz-btn biz-btn-primary" onclick="qtSave(\''+id+'\','+q.seq+')">Save</button>'
    +'<button class="biz-btn biz-btn-secondary" onclick="document.getElementById(\'qt-modal\').remove()">Cancel</button>'
    +'</div></div>';
  document.body.appendChild(ov);
  (q.items||[]).forEach(function(it){ qtAddRow(it); });
  qtCalc();
}

function qtLoadTmpl(){
  var k=(document.getElementById('qt-f-tmpl')||{}).value;
  if(!k) return;
  var tmpl=QT_TEMPLATES[k];
  if(!tmpl) return;
  document.getElementById('qt-f-service').value=tmpl.name;
  document.getElementById('qt-li-body').innerHTML='';
  tmpl.items.forEach(function(it){ qtAddRow(it); });
  qtCalc();
}

function qtAddRow(it){
  it=it||{desc:'',qty:1,unit:'Each',rate:0,basis:''};
  var tbody=document.getElementById('qt-li-body');
  if(!tbody) return;
  var tr=document.createElement('tr');
  var bDiv=it.basis?'<div style="font-size:10px;color:#888;font-style:italic;padding:1px 0 0 1px;">'+esc(it.basis)+'</div>':'';
  tr.innerHTML='<td><input value="'+esc(it.desc)+'" onchange="qtCalc()" oninput="qtCalc()">'+bDiv
    +'<input type="hidden" class="qt-basis-data" value="'+esc(it.basis||'')+'"></td>'
    +'<td><input type="number" value="'+it.qty+'" min="0" step="any" onchange="qtCalc()" oninput="qtCalc()" style="text-align:right;"></td>'
    +'<td><input value="'+esc(it.unit||'Each')+'" ></td>'
    +'<td><input type="number" value="'+it.rate+'" min="0" step="any" onchange="qtCalc()" oninput="qtCalc()" style="text-align:right;"></td>'
    +'<td class="li-amt" style="text-align:right;font-size:12px;">R0</td>'
    +'<td><button onclick="this.closest(\'tr\').remove();qtCalc();" style="border:none;background:none;color:#c0392b;cursor:pointer;font-size:14px;">&times;</button></td>';
  tbody.appendChild(tr);
  qtCalc();
}

function qtCalc(){
  var tbody=document.getElementById('qt-li-body');
  if(!tbody) return;
  var subtotal=0;
  tbody.querySelectorAll('tr').forEach(function(tr){
    var inputs=tr.querySelectorAll('input');
    var qty=parseFloat(inputs[1].value)||0;
    var rate=parseFloat(inputs[3].value)||0;
    var amt=qty*rate;
    subtotal+=amt;
    tr.querySelector('.li-amt').textContent='R'+fmtMoney(amt);
  });
  var vatRate=parseInt((document.getElementById('qt-f-vat')||{}).value||'0');
  var vat=subtotal*vatRate/100;
  var total=subtotal+vat;
  var el=document.getElementById('qt-totals');
  if(el) el.innerHTML='Subtotal: <strong>R'+fmtMoney(subtotal)+'</strong>'
    +(vatRate?'<br>VAT ('+vatRate+'%): <strong>R'+fmtMoney(vat)+'</strong>':'')
    +'<br><span style="font-size:15px;">TOTAL: <strong style="font-size:17px;color:var(--amb);">R'+fmtMoney(total)+'</strong></span>';
}

function qtGetItems(){
  var tbody=document.getElementById('qt-li-body');
  if(!tbody) return [];
  var items=[];
  tbody.querySelectorAll('tr').forEach(function(tr){
    var inputs=tr.querySelectorAll('input:not([type=hidden])');
    var basisEl=tr.querySelector('.qt-basis-data');
    items.push({desc:inputs[0].value,qty:parseFloat(inputs[1].value)||0,unit:inputs[2].value,rate:parseFloat(inputs[3].value)||0,basis:basisEl?basisEl.value:''});
  });
  return items;
}

function qtSave(id,seq){
  var svc=(document.getElementById('qt-f-service').value||'').trim();
  if(!svc){ document.getElementById('qt-modal-err').textContent='Service description is required.'; return; }
  var clientId=(document.getElementById('qt-f-client')||{}).value||'';
  var client=bizGet('cl_'+clientId)||{};
  var items=qtGetItems();
  var subtotal=items.reduce(function(s,it){ return s+it.qty*it.rate; },0);
  var vatRate=parseInt((document.getElementById('qt-f-vat')||{}).value||'0');
  var vat=subtotal*vatRate/100;
  var total=subtotal+vat;
  var qid=id||('qt_'+Date.now());
  var existing=bizGet('qt_'+qid)||{createdAt:Date.now()};
  var rec=Object.assign(existing,{
    id:qid,seq:seq,quoteNo:'QT-'+padN(seq,4),
    clientId:clientId,clientName:client.name||'',
    serviceType:svc,
    siteAddress:(document.getElementById('qt-f-site').value||'').trim(),
    validUntil:(document.getElementById('qt-f-valid').value||''),
    notes:(document.getElementById('qt-f-notes').value||'').trim(),
    status:(document.getElementById('qt-f-status').value||'draft'),
    items:items,subtotal:subtotal,vatRate:vatRate,vat:vat,total:total
  });
  bizSet('qt_'+qid,rec);
  document.getElementById('qt-modal').remove();
  qtRender();
}

function qtPrint(id){
  var q=bizGet('qt_'+id);
  if(!q) return;
  var client=bizGet('cl_'+q.clientId)||{};
  var rows=(q.items||[]).map(function(it,i){
    return '<tr style="border-bottom:1px solid #e0d8cc;">'
      +'<td style="padding:5px 8px;font-size:12px;">'+(i+1)+'</td>'
      +'<td style="padding:5px 8px;font-size:12px;">'+esc(it.desc)+(it.basis?'<div style="font-size:10px;color:#888;font-style:italic;margin-top:1px;">'+esc(it.basis)+'</div>':'')+'</td>'
      +'<td style="padding:5px 8px;font-size:12px;text-align:right;">'+it.qty+'</td>'
      +'<td style="padding:5px 8px;font-size:12px;">'+esc(it.unit||'')+'</td>'
      +'<td style="padding:5px 8px;font-size:12px;text-align:right;">R '+fmtMoney(it.rate)+'</td>'
      +'<td style="padding:5px 8px;font-size:12px;text-align:right;font-weight:600;">R '+fmtMoney(it.qty*it.rate)+'</td>'
      +'</tr>';
  }).join('');
  var html='<div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;padding:30px 24px;color:#222;">'
    +'<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;">'
    +'<div><div style="font-size:22px;font-weight:800;color:#1E8540;">RIBA T TSEKE</div>'
    +'<div style="font-size:11px;color:#666;margin-top:3px;">Installation Electrician (DoEL)</div>'
    +'<div style="font-size:11px;color:#666;">072 474 8888 &middot; ribattseke@gmail.com &middot; ribattseke.co.za</div></div>'
    +'<div style="text-align:right;"><div style="font-size:20px;font-weight:800;color:#1E8540;letter-spacing:.05em;">QUOTATION</div>'
    +'<div style="font-size:13px;font-weight:700;">'+q.quoteNo+'</div>'
    +'<div style="font-size:11px;color:#666;">Date: '+bizDateStr(q.createdAt)+'</div>'
    +(q.validUntil?'<div style="font-size:11px;color:#666;">Valid until: '+q.validUntil+'</div>':'')
    +'</div></div>'
    +'<div style="display:flex;gap:20px;margin-bottom:20px;flex-wrap:wrap;">'
    +'<div style="flex:1;min-width:200px;background:#f7f4ef;border-radius:8px;padding:12px 14px;">'
    +'<div style="font-size:10px;font-weight:700;letter-spacing:.06em;color:#888;margin-bottom:5px;">BILL TO</div>'
    +'<div style="font-size:13.5px;font-weight:700;">'+esc(client.name||q.clientName||'')+'</div>'
    +(client.company?'<div style="font-size:12px;color:#555;">'+esc(client.company)+'</div>':'')
    +(client.address?'<div style="font-size:12px;color:#555;white-space:pre-line;">'+esc(client.address)+'</div>':'')
    +(client.phone?'<div style="font-size:12px;color:#555;">'+esc(client.phone)+'</div>':'')
    +(client.email?'<div style="font-size:12px;color:#555;">'+esc(client.email)+'</div>':'')
    +'</div>'
    +(q.siteAddress?'<div style="flex:1;min-width:200px;background:#f7f4ef;border-radius:8px;padding:12px 14px;">'
    +'<div style="font-size:10px;font-weight:700;letter-spacing:.06em;color:#888;margin-bottom:5px;">SITE ADDRESS</div>'
    +'<div style="font-size:13px;white-space:pre-line;">'+esc(q.siteAddress)+'</div></div>':'')
    +'</div>'
    +'<div style="font-size:13px;font-weight:700;margin-bottom:8px;color:#1E8540;">'+esc(q.serviceType)+'</div>'
    +'<table style="width:100%;border-collapse:collapse;margin-bottom:12px;">'
    +'<thead><tr style="background:#1E8540;color:#fff;">'
    +'<th style="padding:7px 8px;text-align:left;font-size:11px;">#</th>'
    +'<th style="padding:7px 8px;text-align:left;font-size:11px;">Description</th>'
    +'<th style="padding:7px 8px;text-align:right;font-size:11px;">Qty</th>'
    +'<th style="padding:7px 8px;text-align:left;font-size:11px;">Unit</th>'
    +'<th style="padding:7px 8px;text-align:right;font-size:11px;">Rate</th>'
    +'<th style="padding:7px 8px;text-align:right;font-size:11px;">Amount</th>'
    +'</tr></thead><tbody>'+rows+'</tbody></table>'
    +'<div style="text-align:right;font-size:13px;line-height:2;">'
    +'Subtotal: <strong>R '+fmtMoney(q.subtotal)+'</strong><br>'
    +(q.vatRate?'VAT ('+q.vatRate+'%): <strong>R '+fmtMoney(q.vat)+'</strong><br>':'')
    +'<span style="font-size:16px;font-weight:800;">TOTAL: R '+fmtMoney(q.total)+'</span></div>'
    +(q.notes?'<div style="margin-top:16px;background:#f7f4ef;border-radius:8px;padding:12px 14px;font-size:12.5px;color:#444;"><strong>Notes:</strong><br>'+esc(q.notes).replace(/\n/g,'<br>')+'</div>':'')
    +'<div style="margin-top:28px;border-top:1px solid #ccc;padding-top:16px;display:flex;gap:40px;flex-wrap:wrap;">'
    +'<div><div style="font-size:11px;color:#888;margin-bottom:24px;">AUTHORISED SIGNATURE</div>'
    +'<div style="border-top:1px solid #999;width:200px;margin-top:4px;"></div>'
    +'<div style="font-size:11px;color:#666;margin-top:4px;">Riba T Tseke &middot; Riba T Tseke</div></div>'
    +'<div><div style="font-size:11px;color:#888;margin-bottom:24px;">CLIENT ACCEPTANCE</div>'
    +'<div style="border-top:1px solid #999;width:200px;margin-top:4px;"></div>'
    +'<div style="font-size:11px;color:#666;margin-top:4px;">Name &amp; Date</div></div>'
    +'</div>'
    +'<div style="margin-top:16px;font-size:10.5px;color:#999;text-align:center;">This quotation is valid for 30 days unless otherwise stated. E&amp;OE.</div>'
    +'</div>';
  doPrintDoc(html,'Quotation '+q.quoteNo);
}

/* ===========================================
   LOI / NOTICE TO PROCEED
   =========================================== */
function loiRender(){
  var q=(document.getElementById('loi-search')||{}).value||'';
  var list=bizList('loi_');
  if(q) list=list.filter(function(x){ return (x.loiNo+''+x.clientName+x.project).toLowerCase().indexOf(q.toLowerCase())>-1; });
  var el=document.getElementById('loi-list');
  if(!el) return;
  if(!list.length){ el.innerHTML='<p style="font-size:13px;color:var(--fg3);text-align:center;padding:20px 0;">No LOIs yet.</p>'; return; }
  el.innerHTML=list.map(function(l){
    var sb={'pending':'biz-badge-orange','signed':'biz-badge-green','cancelled':'biz-badge-red'}[l.status]||'biz-badge-grey';
    return '<div class="biz-card">'
      +'<div class="biz-card-row">'
      +'<div><div class="biz-card-title">LOI-'+padN(l.seq,4)+' &mdash; '+esc(l.clientName||'')+'</div>'
      +'<div class="biz-card-sub">'+esc(l.project||'')+(l.quoteRef?' &middot; Ref: '+esc(l.quoteRef):'')+'</div>'
      +'<div class="biz-card-sub">'+bizDateStr(l.createdAt)+(l.value?' &middot; <strong>R'+fmtMoney(l.value)+'</strong>':'')+'</div></div>'
      +'<span class="biz-badge '+sb+'">'+l.status+'</span>'
      +'</div>'
      +'<div class="biz-card-actions">'
      +'<button class="biz-btn biz-btn-secondary" onclick="loiEdit(\''+l.id+'\')">Edit</button>'
      +'<button class="biz-btn biz-btn-primary" onclick="loiPrint(\''+l.id+'\')">Print / PDF</button>'
      +'<button class="biz-btn biz-btn-secondary" style="background:#e8f4ed;color:#1E8540;border-color:#1E8540;" onclick="agrFromLoi(\''+l.id+'\')">&#128203; Agreement</button>'
      +'<button class="biz-btn biz-btn-danger" onclick="bizDelConfirm(\'loi_'+l.id+'\',loiRender)">Del</button>'
      +'</div></div>';
  }).join('');
}

function loiNew(preClientId,preQtId){
  var clients=bizList('cl_');
  var clOpts=clients.map(function(c){ return '<option value="'+c.id+'"'+(preClientId===c.id?' selected':'')+'>'+esc(c.name)+(c.company?' ('+esc(c.company)+')':'')+'</option>'; }).join('');
  var seq=bizNextSeq('loi');
  var preQt=preQtId?bizGet('qt_'+preQtId):null;
  var ov=document.createElement('div');
  ov.className='biz-modal-bg';
  ov.id='loi-modal';
  ov.innerHTML='<div class="biz-modal">'
    +'<h4>New Letter of Intent &mdash; LOI-'+padN(seq,4)+'</h4>'
    +'<p style="font-size:12.5px;color:var(--fg3);margin:0 0 14px;">A Letter of Intent confirms the client intends to proceed before full mobilisation. It protects you from spending resources on a job that does not proceed.</p>'
    +'<div class="biz-field"><label class="biz-label">Client *</label>'
    +'<select class="biz-input" id="loi-f-client">'+(clOpts||'<option value="">-- Add a client first --</option>')+'</select></div>'
    +'<div class="biz-field"><label class="biz-label">Project / Scope *</label><input class="biz-input" id="loi-f-project" value="'+esc((preQt&&preQt.serviceType)||'')+'"></div>'
    +'<div class="biz-field"><label class="biz-label">Quote Reference</label><input class="biz-input" id="loi-f-qtref" value="'+(preQt?preQt.quoteNo:'')+'"></div>'
    +'<div class="biz-field"><label class="biz-label">Contract Value (R)</label><input class="biz-input" id="loi-f-value" type="number" value="'+(preQt?preQt.total:'')+'"></div>'
    +'<div class="biz-field"><label class="biz-label">Deposit Required (R)</label><input class="biz-input" id="loi-f-deposit" type="number" value="" placeholder="e.g. 50% of quote total"></div>'
    +'<div class="biz-field"><label class="biz-label">Intended Start Date</label><input class="biz-input" id="loi-f-start" type="date"></div>'
    +'<div class="biz-field"><label class="biz-label">Special Conditions</label><textarea class="biz-textarea" id="loi-f-cond" placeholder="e.g. Client to provide safe site access. All materials on a supply-and-install basis."></textarea></div>'
    +'<div class="biz-field"><label class="biz-label">Status</label>'
    +'<select class="biz-input" id="loi-f-status"><option value="pending">Pending</option><option value="signed">Signed</option><option value="cancelled">Cancelled</option></select></div>'
    +'<p id="loi-modal-err" style="color:#e55;font-size:12px;min-height:14px;"></p>'
    +'<div class="biz-modal-actions">'
    +'<button class="biz-btn biz-btn-primary" onclick="loiSave(null,'+seq+(preQt?',\''+preQt.clientId+'\'':',null')+')">Save LOI</button>'
    +'<button class="biz-btn biz-btn-secondary" onclick="document.getElementById(\'loi-modal\').remove()">Cancel</button>'
    +'</div></div>';
  document.body.appendChild(ov);
  if(preClientId){ var sel=document.getElementById('loi-f-client'); if(sel) sel.value=preClientId; }
}

function loiFromQt(qtId){
  var q=bizGet('qt_'+qtId);
  if(!q) return;
  hubShow('hub-loi',document.querySelector('.hub-nav-btn[onclick*="hub-loi"]'));
  loiNew(q.clientId,qtId);
}

function loiEdit(id){
  var l=bizGet('loi_'+id);
  if(!l) return;
  var clients=bizList('cl_');
  var clOpts=clients.map(function(c){ return '<option value="'+c.id+'"'+(l.clientId===c.id?' selected':'')+'>'+esc(c.name)+(c.company?' ('+esc(c.company)+')':'')+'</option>'; }).join('');
  var ov=document.createElement('div');
  ov.className='biz-modal-bg';
  ov.id='loi-modal';
  ov.innerHTML='<div class="biz-modal">'
    +'<h4>Edit LOI &mdash; LOI-'+padN(l.seq,4)+'</h4>'
    +'<div class="biz-field"><label class="biz-label">Client</label><select class="biz-input" id="loi-f-client">'+clOpts+'</select></div>'
    +'<div class="biz-field"><label class="biz-label">Project / Scope *</label><input class="biz-input" id="loi-f-project" value="'+esc(l.project||'')+'"></div>'
    +'<div class="biz-field"><label class="biz-label">Quote Reference</label><input class="biz-input" id="loi-f-qtref" value="'+esc(l.quoteRef||'')+'"></div>'
    +'<div class="biz-field"><label class="biz-label">Contract Value (R)</label><input class="biz-input" id="loi-f-value" type="number" value="'+(l.value||'')+'"></div>'
    +'<div class="biz-field"><label class="biz-label">Deposit Required (R)</label><input class="biz-input" id="loi-f-deposit" type="number" value="'+(l.deposit||'')+'"></div>'
    +'<div class="biz-field"><label class="biz-label">Intended Start Date</label><input class="biz-input" id="loi-f-start" type="date" value="'+esc(l.startDate||'')+'"></div>'
    +'<div class="biz-field"><label class="biz-label">Special Conditions</label><textarea class="biz-textarea" id="loi-f-cond">'+esc(l.conditions||'')+'</textarea></div>'
    +'<div class="biz-field"><label class="biz-label">Status</label>'
    +'<select class="biz-input" id="loi-f-status">'
    +['pending','signed','cancelled'].map(function(s){ return '<option value="'+s+'"'+(l.status===s?' selected':'')+'>'+s+'</option>'; }).join('')
    +'</select></div>'
    +'<p id="loi-modal-err" style="color:#e55;font-size:12px;min-height:14px;"></p>'
    +'<div class="biz-modal-actions">'
    +'<button class="biz-btn biz-btn-primary" onclick="loiSave(\''+id+'\','+l.seq+',\''+l.clientId+'\')">Save</button>'
    +'<button class="biz-btn biz-btn-secondary" onclick="document.getElementById(\'loi-modal\').remove()">Cancel</button>'
    +'</div></div>';
  document.body.appendChild(ov);
}

function loiSave(id,seq,preClientId){
  var project=(document.getElementById('loi-f-project').value||'').trim();
  if(!project){ document.getElementById('loi-modal-err').textContent='Project description is required.'; return; }
  var clientId=(document.getElementById('loi-f-client')||{}).value||preClientId||'';
  var client=bizGet('cl_'+clientId)||{};
  var lid=id||('loi_'+Date.now());
  var existing=bizGet('loi_'+lid)||{createdAt:Date.now()};
  var rec=Object.assign(existing,{
    id:lid,seq:seq,loiNo:'LOI-'+padN(seq,4),
    clientId:clientId,clientName:client.name||'',
    project:project,
    quoteRef:(document.getElementById('loi-f-qtref').value||'').trim(),
    value:parseFloat(document.getElementById('loi-f-value').value)||0,
    deposit:parseFloat(document.getElementById('loi-f-deposit').value)||0,
    startDate:(document.getElementById('loi-f-start').value||''),
    conditions:(document.getElementById('loi-f-cond').value||'').trim(),
    status:(document.getElementById('loi-f-status').value||'pending')
  });
  bizSet('loi_'+lid,rec);
  document.getElementById('loi-modal').remove();
  loiRender();
}

function loiPrint(id){
  var l=bizGet('loi_'+id);
  if(!l) return;
  var client=bizGet('cl_'+l.clientId)||{};
  var html='<div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;padding:30px 24px;color:#222;">'
    +'<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;">'
    +'<div><div style="font-size:22px;font-weight:800;color:#1E8540;">RIBA T TSEKE</div>'
    +'<div style="font-size:11px;color:#666;margin-top:3px;">Installation Electrician (DoEL)</div>'
    +'<div style="font-size:11px;color:#666;">072 474 8888 &middot; ribattseke@gmail.com &middot; ribattseke.co.za</div></div>'
    +'<div style="text-align:right;">'
    +'<div style="font-size:18px;font-weight:800;color:#1E8540;">LETTER OF INTENT</div>'
    +'<div style="font-size:13px;font-weight:700;">LOI-'+padN(l.seq,4)+'</div>'
    +'<div style="font-size:11px;color:#666;">Date: '+bizDateStr(l.createdAt)+'</div>'
    +'</div></div>'
    +'<div style="margin-bottom:20px;">'
    +'<div style="font-size:11px;font-weight:700;letter-spacing:.06em;color:#888;margin-bottom:4px;">TO</div>'
    +'<div style="font-size:14px;font-weight:700;">'+esc(client.name||l.clientName||'')+'</div>'
    +(client.company?'<div style="font-size:12.5px;">'+esc(client.company)+'</div>':'')
    +(client.address?'<div style="font-size:12.5px;white-space:pre-line;">'+esc(client.address)+'</div>':'')
    +(client.phone?'<div style="font-size:12.5px;">'+esc(client.phone)+'</div>':'')
    +'</div>'
    +'<div style="font-size:13.5px;line-height:1.75;margin-bottom:18px;">'
    +'<p>Dear '+(client.name?esc(client.name.split(' ')[0]):'Client')+',</p>'
    +'<p>We are pleased to confirm receipt of your intention to proceed with the following work, subject to the terms below:</p>'
    +'<p><strong>Project / Scope of Work:</strong><br>'+esc(l.project).replace(/\n/g,'<br>')+'</p>'
    +(l.quoteRef?'<p><strong>Quotation Reference:</strong> '+esc(l.quoteRef)+'</p>':'')
    +(l.value?'<p><strong>Anticipated Contract Value:</strong> R '+fmtMoney(l.value)+(l.vatRate?' (excluding VAT)':'')+'</p>':'')
    +(l.deposit?'<p><strong>Deposit Required to Mobilise:</strong> R '+fmtMoney(l.deposit)+' (payable before commencement)</p>':'')
    +(l.startDate?'<p><strong>Anticipated Start Date:</strong> '+l.startDate+'</p>':'')
    +(l.conditions?'<p><strong>Special Conditions:</strong><br>'+esc(l.conditions).replace(/\n/g,'<br>')+'</p>':'')
    +'<p>By signing below, you confirm your intent to proceed with the above scope and authorise Riba T Tseke to undertake the necessary preparation and procurement activities. This letter does not constitute a binding contract; a formal agreement will follow.</p>'
    +'</div>'
    +'<div style="display:flex;gap:40px;margin-top:30px;border-top:1px solid #ccc;padding-top:20px;flex-wrap:wrap;">'
    +'<div style="flex:1;min-width:200px;">'
    +'<div style="font-size:11px;color:#888;margin-bottom:24px;">FOR RIBA T TSEKE</div>'
    +'<div style="border-top:1px solid #999;width:220px;"></div>'
    +'<div style="font-size:11px;color:#555;margin-top:4px;">Tseke Riba &middot; Date: ___________</div>'
    +'</div>'
    +'<div style="flex:1;min-width:200px;">'
    +'<div style="font-size:11px;color:#888;margin-bottom:24px;">CLIENT SIGNATURE</div>'
    +'<div style="border-top:1px solid #999;width:220px;"></div>'
    +'<div style="font-size:11px;color:#555;margin-top:4px;">Name: ___________ &middot; Date: ___________</div>'
    +'</div></div>'
    +'<div style="margin-top:16px;font-size:10.5px;color:#999;text-align:center;">Riba T Tseke &middot; Gauteng, South Africa &middot; ribattseke.co.za</div>'
    +'</div>';
  doPrintDoc(html,'LOI-'+padN(l.seq,4));
}

/* ===========================================
   WORKS AGREEMENTS
   =========================================== */

var AGR_TEMPLATES = {
  electrical: {
    name: 'Electrical Installation / Repair',
    serviceType: 'Electrical Installation',
    scope: `Supply, install and commission the electrical works as per the accepted quotation. All work to comply with SANS 10142-1 (Ed 3.3) and the SRWP Regulations, including:
• All wiring, cabling, conduit and cable management as specified
• Distribution board (DB) work: new circuits, breaker replacement or additions
• Earth leakage protection (RCCB/ELCB) where required by regulation
• Surge protection (SPD) where quoted
• Light fittings, switch plates and socket outlets as specified
• Earthing and bonding of metallic structures and services
• All DB labelling: circuit identifications, warning labels, arc-flash labels
• Insulation resistance and earth continuity testing on all new circuits
• Certificate of Compliance (CoC) issued on satisfactory completion
• As-built circuit schedule (where scope warrants)`,
    plannedMaint: `Recommended Annual Electrical Inspection:
1. Visual inspection of all accessible wiring, fittings, conduit and cable management
2. Distribution board inspection: breaker condition, loose terminations, correct labelling, earth bar connections
3. Insulation resistance test on all circuits (500V DC)
4. Earth continuity test from DB earth bar to furthest outlet on each circuit
5. RCD / ELCB function test (trip time measured; replace if > 300ms)
6. SPD status indicator check
7. Visual check for signs of overheating: discolouration, burning odours, melted insulation
8. Inspection report issued with pass/fail status and any recommended remedial actions

Residential: re-inspection every 5 years recommended. Commercial / industrial: every 3 years or as required by occupancy insurance.`,
    unplannedMaint: `Fault Response Times:
• Safety risk (shock hazard, sparking, burning smell, exposed live conductors): same business day if reported by 12:00; next business day otherwise
• Partial circuit failure (lights off, sockets dead, single circuit tripped): within 2 business days
• Advisory / non-urgent fault: within 5 business days

All fault reports must be made in writing (WhatsApp or email). Where a fault constitutes an immediate danger to life or property, the client must isolate the affected circuit(s) at the DB immediately and await instruction from Riba T Tseke.

Riba T Tseke is not liable for damage to appliances or property resulting from power quality issues, grid fluctuations, load-shedding, lightning events, or modifications made by any unauthorised party.`,
    calloutFees: `Call-out / Fallout Fees (subject to annual CPI adjustment):

Standard (Mon–Fri, 07:00–17:00):         R750 per visit + labour at IE hourly rate
Extended hours (Mon–Fri, 17:01–20:00):   R1,100 per visit + labour at 1.5× IE rate
Weekend / Public holiday (08:00–17:00):  R1,600 per visit + labour at 2.0× IE rate
After-hours emergency (20:01–06:59):     R2,200 per visit + labour at 2.5× IE rate

Parts and materials charged at cost plus 15% handling margin. Travel beyond 30 km charged at the prevailing SARS deemed rate per km. Minimum 1 hour labour per call-out.`,
    insuranceReqs: `Client Insurance Obligations:
1. The client must maintain a valid homeowner's or commercial property insurance policy covering the electrical installation against fire, surge, theft and malicious damage
2. Any modifications to the electrical installation by an unregistered or unqualified person automatically invalidates the CoC issued by Riba T Tseke and may void the workmanship warranty
3. The client must notify Riba T Tseke within 48 hours of any fire, lightning strike, flood or surge event that may have affected the installation
4. It is the client's responsibility to ensure that any additional loads or circuits added after the CoC date are covered by a new CoC from a registered electrician`,
    paymentTerms: `1. Payment terms as per accepted quotation
2. Certificate of Compliance (CoC) is issued only after full payment has been confirmed
3. Invoices unpaid after 30 days attract interest at the prime lending rate plus 2% per month
4. Deposit (where required) is non-refundable once materials have been procured`,
    warranty: `1. Workmanship warranty: 12 months from date of CoC issue, covering defects in installation workmanship
2. Component and materials warranty: as per manufacturer's terms
3. Warranty is void if the installation is modified or interfered with by any other party without written consent from Riba T Tseke, or if physical damage occurs and is not reported within 48 hours`,
    generalConditions: `1. All work performed in accordance with SANS 10142-1 (Ed 3.3) and the SRWP Regulations
2. The client must ensure safe, clear access to all work areas before work commences; delays caused by inaccessibility are charged at the hourly rate
3. Supply interruptions will occur during installation / DB work — the client must plan accordingly and isolate sensitive equipment
4. Riba T Tseke is not liable for indirect or consequential losses arising from installation downtime
5. This agreement is governed by the laws of the Republic of South Africa`
  },

  coc: {
    name: 'CoC Inspection',
    serviceType: 'CoC Electrical Inspection',
    scope: `Electrical installation inspection and testing for the purpose of issuing a Certificate of Compliance (CoC) as required by the SRWP Regulations and SANS 10142-1.

Scope includes:
• Full visual inspection of all accessible wiring, fittings, conduit and cable management
• Distribution board inspection: breaker sizing, labelling, earthing, incoming protection
• Insulation resistance test on all circuits (500V DC)
• Earth continuity test from DB earth bar to all outlets and metalwork
• RCD / ELCB function test (trip time recorded)
• SPD status check (where present)
• Earth electrode resistance test (where applicable)
• Verification of circuit labelling accuracy and completeness
• Certificate of Compliance issued if all tests pass and no visible deviations are found
• Deviation Report issued if defects are found that must be remedied before CoC issue; each fault and required corrective action is specified`,
    plannedMaint: `CoC Validity and Re-inspection Recommendations:
A Certificate of Compliance remains valid for the installation as described at the time of issue. The CoC becomes invalid when the electrical installation is altered, extended or rewired (even partially), or when a new fixed appliance or dedicated circuit is added.

The CoC is also required when the property is sold or transferred (a valid CoC is a legal requirement for the property seller).

Riba T Tseke recommends re-inspection intervals:
• Residential property: every 5 years, or on any ownership change
• Commercial / light industrial: every 3 years, or as required by occupancy insurance
• High-load or industrial installations: annually or as specified by SANS 10142-1 Section 8`,
    unplannedMaint: `A re-inspection is required whenever the electrical installation is altered or extended in any way, when a new appliance requiring dedicated wiring is installed (geyser, stove, air conditioner, EV charger, solar PV system), when the property changes ownership, or when an insurance claim is made relating to the electrical installation.

Re-inspections are treated as new engagements and standard inspection rates apply. If remedial work is required, Riba T Tseke will quote separately for the corrective work and a re-inspection fee applies after completion.`,
    calloutFees: `Inspection Fees:
• Standard residential inspection (up to 4-bedroom property): as per accepted quotation
• Re-inspection after client-performed remedial work: 50% of original inspection fee
• Additional boards or outbuildings not on the original scope: quoted and invoiced separately
• Additional circuits discovered beyond original count: R125 per circuit tested
• Travel (> 30 km from Riba T Tseke base): AA deemed rate per km additional

A re-inspection within 30 days for the same fault is covered. Re-inspections beyond 30 days are charged at the re-inspection rate.`,
    insuranceReqs: `The client acknowledges that:
1. It is the homeowner's / occupant's legal obligation to maintain the electrical installation in a safe and compliant condition at all times
2. Any modifications after CoC issue not covered by a new CoC create a legal liability for the property owner
3. Concealed or inaccessible wiring that cannot be safely tested without damage may be excluded from the CoC scope and will be noted in the CoC or deviation report
4. The client must disclose any known defects or prior modifications before the inspection commences`,
    paymentTerms: `Payment is due on the day of inspection, before the CoC document is released. The CoC is not released until payment is confirmed. Acceptable payment methods: EFT (proof of payment on day) or cash.`,
    warranty: `A CoC is a sworn statement of the installation's compliance at the date and time of test. If a fault present at the time of inspection is discovered within 30 days of CoC issue and was reasonably accessible, Riba T Tseke will re-inspect at no additional cost. Riba T Tseke is not liable for faults that develop after the inspection date due to normal aging, additional loads or external interference.`,
    generalConditions: `1. The property owner or a duly authorised representative must be present during the inspection
2. Riba T Tseke must have safe, unimpeded access to all distribution boards, sub-boards, circuits and fittings; inaccessible areas will be excluded from the CoC scope
3. The client must disclose all known faults, modifications or additions before the inspection starts
4. This agreement is governed by the laws of the Republic of South Africa`
  },

  db: {
    name: 'Distribution Board Upgrade',
    serviceType: 'DB Upgrade / Replacement',
    scope: `Supply and install a new / upgraded distribution board (DB) as per the accepted quotation, including:
• New DB enclosure (DIN-rail, correct IP rating for the installation environment)
• Correctly sized main incomer MCB or MCCB with appropriate fault rating
• Circuit breakers (MCBs) correctly rated for each circuit per SANS 10142-1 Section 7
• Earth leakage protection (ELCB / RCCB) on all circuits as required by SANS 10142-1
• Type 2 surge protection device (SPD) where quoted — with separate fused back-up
• Copper earth bar and neutral bar, correctly sized and bonded
• Incoming earth electrode connection and supplementary earthing if required
• All circuit terminations neatly dressed and torqued to specification
• Full and accurate circuit labelling (permanent, legible, printed or engraved)
• Arc-flash / danger warning labels on all doors and covers
• CoC issued on successful completion of all tests
• As-built circuit schedule left at the DB on completion`,
    plannedMaint: `Recommended Annual DB Inspection:
1. Visual check of all breakers: signs of overheating, discolouration, trip indicators
2. Terminal re-torque: all circuit terminations, earth bar lugs, main incomer terminations
3. Confirm all circuit labelling is current, accurate and legible
4. SPD status indicator check — replace if indicator shows fault
5. RCD / ELCB function test (trip time and sensitivity measured)
6. Earth continuity from DB earth bar to furthest outlet on each circuit
7. Insulation resistance test on all circuits (selective — based on age and fault history)
8. Check DB enclosure door alignment, locking mechanism and weatherseal
9. Brief inspection report noting any breakers to be replaced or concerns identified`,
    unplannedMaint: `Fault Response Times:
• Tripping / nuisance tripping / loss of circuits: within 1–2 business days
• Total DB failure / main incomer fault: same business day if reported by 12:00; next business day otherwise
• SPD fault indicator / advisory: within 5 business days

Notify Riba T Tseke in writing (WhatsApp or email) with a description of the fault and any relevant photographs. Do not attempt to bypass a tripped breaker repeatedly if it re-trips — this indicates a fault that requires investigation.`,
    calloutFees: `DB Fault / Advisory Visit Fees:

Standard (Mon–Fri, 07:00–17:00):         R750 per visit + labour at IE hourly rate
Extended hours (Mon–Fri, 17:01–20:00):   R1,100 per visit + labour at 1.5× IE rate
Weekend / Public holiday (08:00–17:00):  R1,600 per visit + labour at 2.0× IE rate
After-hours emergency (20:01–06:59):     R2,200 per visit + labour at 2.5× IE rate

Parts charged at cost plus 15% handling margin. Replacement breakers, terminals and SPDs are invoiced separately.`,
    insuranceReqs: `The client must ensure the DB installation is not modified by any party other than a registered electrician. Specifically:
1. No additional circuits, breakers or loads may be added without prior notification to Riba T Tseke
2. The DB must remain accessible (not blocked by furniture, shelving or other obstructions) at all times
3. Any modifications not sanctioned by Riba T Tseke void the CoC and workmanship warranty
4. The client's property insurance must cover the DB and associated wiring; the client must notify their insurer of the DB upgrade to ensure adequate cover`,
    paymentTerms: `1. Payment terms as per accepted quotation
2. Certificate of Compliance (CoC) is issued only after full payment is confirmed
3. Invoices unpaid after 30 days attract interest at the prime rate plus 2% per month`,
    warranty: `1. Workmanship warranty: 12 months from CoC issue date, covering installation defects
2. Component warranty: as per manufacturer's terms for breakers, SPD and enclosure
3. Warranty is void if the DB is opened, modified or interfered with by any party other than Riba T Tseke
4. Lightning and surge damage are excluded unless an SPD is installed and maintained`,
    generalConditions: `1. All work performed to SANS 10142-1 (Ed 3.3) and the SRWP Regulations
2. The client must isolate all sensitive equipment (computers, servers, medical, AV systems) before DB work commences — Riba T Tseke will not be liable for equipment damage during power interruptions
3. Supply to the installation will be interrupted during installation — the client must plan accordingly
4. This agreement is governed by the laws of the Republic of South Africa`
  },

  maintenance: {
    name: 'Ongoing Maintenance Contract',
    serviceType: 'Maintenance Contract',
    scope: `Ongoing planned and reactive maintenance contract for the client's electrical installation and / or solar PV system as specified in the agreed schedule. This agreement defines the scope of planned maintenance visits, response obligations for unplanned faults, applicable call-out fees and the respective obligations of both parties.

Systems covered under this contract: [specify at commencement — e.g. "3-phase electrical installation including DB and all circuits" / "10 kW solar PV system with 15 kWh battery storage"]

This contract is in addition to and does not replace the original installation warranty. Where warranty terms apply, they take precedence.`,
    plannedMaint: `Planned Maintenance Schedule (confirmed and scheduled at commencement):

Quarterly visit (every 3 months):
• Visual inspection of DB, all accessible wiring and solar PV system (if applicable)
• DB termination re-torque and breaker check
• Solar: inverter log review, quick panel visual inspection
• Issue of brief visit report

Annual full inspection (every 12 months):
• Full electrical inspection as per the CoC scope
• Complete solar PV service (if applicable): panel cleaning, IR scan, battery SoH, firmware update
• Earth continuity and insulation resistance testing
• SPD and RCD function testing
• Comprehensive maintenance report with photographs and test results

All planned visits must be pre-scheduled at least 5 business days in advance. Cancellations within 48 hours are charged at 50% of the visit fee.`,
    unplannedMaint: `Reactive / Unplanned Fault Response (included allowance as specified):

Included call-outs per 12-month contract period: [specify at commencement, e.g. 3]
Included call-outs are at the reduced contract rate — see Clause 4.
Call-outs beyond the included allowance are charged at full standard rates.

Response time commitments:
• Priority 1 (safety risk): same business day if reported by 12:00; next business day otherwise
• Priority 2 (system or circuit down): within 2 business days
• Priority 3 (advisory / non-urgent): within 5 business days

All fault reports must be made in writing (WhatsApp or email). Include photographs and a description of the fault where possible.`,
    calloutFees: `Contract Call-out Rates (reduced contract pricing):

Included call-outs (up to [X] per year):
  Standard hours (Mon–Fri, 07:00–17:00):   R[X] per visit + labour at contract IE rate
  After-hours / weekend (included):         Negotiated at contract commencement

Additional / excess call-outs:
  Standard (Mon–Fri, 07:00–17:00):         R750 per visit + labour at IE hourly rate
  Extended hours (Mon–Fri, 17:01–20:00):   R1,100 per visit + labour at 1.5× IE rate
  Weekend / Public holiday (08:00–17:00):  R1,600 per visit + labour at 2.0× IE rate
  After-hours emergency (20:01–06:59):     R2,200 per visit + labour at 2.5× IE rate

Planned maintenance visits are included in the monthly retainer. Labour and parts for reactive fault repairs are charged in addition to the call-out fee. Parts at cost plus 15% handling margin.`,
    insuranceReqs: `The client must maintain comprehensive insurance covering all systems under this contract and must supply updated proof of insurance to Riba T Tseke annually. Solar PV systems must be declared as a named item at full replacement value. Any lapse in insurance must be reported immediately. Riba T Tseke reserves the right to suspend reactive maintenance obligations during any period of uninsured risk.`,
    paymentTerms: `1. Monthly retainer invoiced on the 1st of each month, payable within 7 days of invoice date
2. Annual CPI adjustment applies on the anniversary of this contract — 30 days' written notice will be given
3. Invoices unpaid after 30 days attract interest at the prime lending rate plus 2% per month
4. Additional work (repairs, parts, excess call-outs) invoiced separately and payable within 14 days`,
    warranty: `All workmanship performed under reactive and planned maintenance visits carries a 90-day workmanship warranty from the date of that visit. Parts and materials are covered by manufacturer warranty terms. The contract does not cover pre-existing faults unless identified and quoted during a maintenance visit.`,
    generalConditions: `1. This contract has an initial term of 12 months from the commencement date and renews automatically unless either party provides 30 days' written notice of non-renewal
2. Either party may cancel with 30 days' written notice; a pro-rata refund of any prepaid retainer applies
3. This contract does not cover damage caused by lightning, surge, theft, vandalism or acts of God unless a specific SPD / surge clause is added by written addendum
4. Riba T Tseke is not liable for consequential, economic or business interruption losses arising from system downtime
5. The client must provide safe, unimpeded access for all visits; failure to provide access within an agreed window forfeits the visit fee
6. This agreement is governed by the laws of the Republic of South Africa`
  }
};

function agrRender(){
  var q=(document.getElementById('agr-search')||{}).value||'';
  var list=bizList('agr_');
  if(q) list=list.filter(function(x){ return (x.agreementNo+''+x.clientName+x.serviceType).toLowerCase().indexOf(q.toLowerCase())>-1; });
  var el=document.getElementById('agr-list');
  if(!el) return;
  if(!list.length){ el.innerHTML='<p style="font-size:13px;color:var(--fg3);text-align:center;padding:20px 0;">No agreements yet. Create one from an LOI using the &#128203; Agreement button on any LOI card.</p>'; return; }
  el.innerHTML=list.map(function(a){
    var sb={'draft':'biz-badge-orange','active':'biz-badge-green','expired':'biz-badge-grey','cancelled':'biz-badge-red'}[a.status]||'biz-badge-grey';
    return '<div class="biz-card">'
      +'<div class="biz-card-row">'
      +'<div><div class="biz-card-title">AGR-'+padN(a.seq,4)+' &mdash; '+esc(a.clientName||'')+'</div>'
      +'<div class="biz-card-sub">'+esc(a.serviceType||'')+(a.siteAddress?' &middot; '+esc(a.siteAddress):'')+'</div>'
      +'<div class="biz-card-sub">'+bizDateStr(a.createdAt)+(a.contractValue?' &middot; <strong>R'+fmtMoney(a.contractValue)+'</strong>':'')+(a.loiRef?' &middot; '+esc(a.loiRef):'')+'</div></div>'
      +'<span class="biz-badge '+sb+'">'+a.status+'</span>'
      +'</div>'
      +'<div class="biz-card-actions">'
      +'<button class="biz-btn biz-btn-secondary" onclick="agrView(\''+a.id+'\')">View</button>'
      +'<button class="biz-btn biz-btn-secondary" onclick="agrEdit(\''+a.id+'\')">Edit</button>'
      +'<button class="biz-btn biz-btn-primary" onclick="agrPrint(\''+a.id+'\')">Print / PDF</button>'
      +(a.signedAt?'<span class="biz-badge biz-badge-green" title="Signed '+esc(a.signedAt)+(a.signedNote?' — '+esc(a.signedNote):'')+'">&#10003; Signed</span>':'<button class="biz-btn" style="background:#1a4d2e;color:#6ee7a0;border-color:#2a7d4f;" onclick="agrMarkSigned(\''+a.id+'\')">Mark Signed</button>')
      +'<button class="biz-btn biz-btn-danger" onclick="bizDelConfirm(\'agr_'+a.id+'\',agrRender)">Del</button>'
      +'</div></div>';
  }).join('');
}

function agrView(id){
  var a=bizGet('agr_'+id);
  if(!a)return;
  var co=getCompany();
  var modal=document.createElement('div');
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;overflow-y:auto;padding:20px;display:flex;align-items:flex-start;justify-content:center;';
  modal.innerHTML='<div style="background:var(--bg);border-radius:12px;max-width:720px;width:100%;padding:28px;position:relative;">'
    +'<button onclick="this.closest(\'[style*=\"fixed\"]\').remove()" style="position:absolute;top:14px;right:16px;background:none;border:none;font-size:20px;cursor:pointer;color:var(--fg3);">&times;</button>'
    +'<p style="font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--fg3);margin:0 0 4px;">Agreement Preview</p>'
    +'<h3 style="margin:0 0 16px;">AGR-'+padN(a.seq,4)+' &mdash; '+esc(a.clientName||'')+'</h3>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 20px;font-size:13px;margin-bottom:18px;">'
    +'<div><span style="color:var(--fg3);">Service:</span> '+esc(a.serviceType||'—')+'</div>'
    +'<div><span style="color:var(--fg3);">Status:</span> '+esc(a.status||'—')+'</div>'
    +'<div><span style="color:var(--fg3);">Value:</span> '+(a.contractValue?'R'+fmtMoney(a.contractValue):'—')+'</div>'
    +'<div><span style="color:var(--fg3);">Created:</span> '+bizDateStr(a.createdAt)+'</div>'
    +(a.siteAddress?'<div style="grid-column:1/-1"><span style="color:var(--fg3);">Site:</span> '+esc(a.siteAddress)+'</div>':'')
    +(a.signedAt?'<div style="grid-column:1/-1;color:#6ee7a0;font-weight:600;">&#10003; Signed on '+esc(a.signedAt)+(a.signedNote?' &mdash; '+esc(a.signedNote):'')+'</div>':'')
    +'</div>'
    +'<div style="background:var(--bg-alt);border-radius:8px;padding:16px;font-size:12.5px;line-height:1.7;white-space:pre-wrap;max-height:400px;overflow-y:auto;">'+esc(a.body||'No body content.')+'</div>'
    +'<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap;">'
    +'<button class="biz-btn biz-btn-primary" onclick="agrPrint(\''+id+'\');this.closest(\'[style*=fixed]\').remove()">Print / PDF</button>'
    +(!a.signedAt?'<button class="biz-btn" style="background:#1a4d2e;color:#6ee7a0;border-color:#2a7d4f;" onclick="this.closest(\'[style*=fixed]\').remove();agrMarkSigned(\''+id+'\')">Mark as Signed</button>':'')
    +'<button class="biz-btn biz-btn-secondary" onclick="this.closest(\'[style*=fixed]\').remove()">Close</button>'
    +'</div>'
    +'</div>';
  document.body.appendChild(modal);
}
function agrMarkSigned(id){
  var a=bizGet('agr_'+id);
  if(!a)return;
  var modal=document.createElement('div');
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.innerHTML='<div style="background:var(--bg);border-radius:12px;max-width:440px;width:100%;padding:24px;">'
    +'<h4 style="margin:0 0 14px;">Mark AGR-'+padN(a.seq,4)+' as Signed</h4>'
    +'<label class="ord-lbl">Date signed *</label>'
    +'<input type="date" id="agr-sign-date" class="ord-input" value="'+today()+'">'
    +'<label class="ord-lbl">Reference / note (optional)</label>'
    +'<input type="text" id="agr-sign-note" class="ord-input" placeholder="e.g. original held at office, WhatsApp scan received, file ref">'
    +'<label class="ord-lbl">Signed copy location (optional)</label>'
    +'<input type="text" id="agr-sign-loc" class="ord-input" placeholder="e.g. Google Drive /Agreements/AGR-0001-signed.pdf">'
    +'<div id="agr-sign-err" style="color:#ef4444;font-size:12px;margin-top:6px;"></div>'
    +'<div style="display:flex;gap:10px;margin-top:14px;">'
    +'<button class="biz-btn biz-btn-primary" onclick="agrSignConfirm(\''+id+'\')">Confirm Signed</button>'
    +'<button class="biz-btn biz-btn-secondary" onclick="this.closest(\'[style*=fixed]\').remove()">Cancel</button>'
    +'</div></div>';
  document.body.appendChild(modal);
}
function agrSignConfirm(id){
  var d=val('agr-sign-date');
  if(!d){document.getElementById('agr-sign-err').textContent='Please enter the date signed.';return;}
  var note=val('agr-sign-note');
  var loc=val('agr-sign-loc');
  var a=bizGet('agr_'+id);
  if(!a)return;
  a.signedAt=d;
  if(note)a.signedNote=note;
  if(loc)a.signedLocation=loc;
  a.status='active';
  bizSet('agr_'+id,a);
  document.querySelector('[style*="position:fixed"][style*="z-index:9999"]').remove();
  agrRender();
}
function agrNew(preClientId,preLoiId){
  var clients=bizList('cl_');
  var clOpts=clients.map(function(c){ return '<option value="'+c.id+'"'+(preClientId===c.id?' selected':'')+'>'+esc(c.name)+(c.company?' ('+esc(c.company)+')':'')+'</option>'; }).join('');
  var seq=bizNextSeq('agr');
  var preLoi=preLoiId?bizGet('loi_'+preLoiId):null;
  var tplOpts=Object.keys(AGR_TEMPLATES).map(function(k){ return '<option value="'+k+'">'+AGR_TEMPLATES[k].name+'</option>'; }).join('');
  var ov=document.createElement('div');
  ov.className='biz-modal-bg';
  ov.id='agr-modal';
  ov.innerHTML='<div class="biz-modal" style="max-width:720px;">'
    +'<h4>New Works Agreement &mdash; AGR-'+padN(seq,4)+'</h4>'
    +'<p style="font-size:12.5px;color:var(--fg3);margin:0 0 14px;">A Works Agreement formalises the scope, maintenance terms, fees and insurance obligations for each job. It follows the LOI / NTP and is signed before work commences.</p>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
    +'<div class="biz-field"><label class="biz-label">Client *</label>'
    +'<select class="biz-input" id="agr-f-client">'+(clOpts||'<option value="">-- Add a client first --</option>')+'</select></div>'
    +'<div class="biz-field"><label class="biz-label">Service Template</label>'
    +'<select class="biz-input" id="agr-f-tpl" onchange="agrTplLoad(this.value)">'
    +'<option value="">-- Select to pre-fill --</option>'+tplOpts+'</select></div>'
    +'<div class="biz-field"><label class="biz-label">Service Type *</label><input class="biz-input" id="agr-f-svc" placeholder="e.g. Solar PV Installation"></div>'
    +'<div class="biz-field"><label class="biz-label">Site Address</label><input class="biz-input" id="agr-f-site" placeholder="Installation address"></div>'
    +'<div class="biz-field"><label class="biz-label">LOI Reference</label><input class="biz-input" id="agr-f-loiref"></div>'
    +'<div class="biz-field"><label class="biz-label">Quote Reference</label><input class="biz-input" id="agr-f-qtref"></div>'
    +'<div class="biz-field"><label class="biz-label">Contract Value (R)</label><input class="biz-input" id="agr-f-value" type="number" placeholder="0"></div>'
    +'<div class="biz-field"><label class="biz-label">Start Date</label><input class="biz-input" id="agr-f-start" type="date"></div>'
    +'</div>'
    +'<div style="margin:16px 0 6px;font-size:13px;font-weight:700;color:var(--amb);">&#128218; Agreement Sections <span style="font-size:11px;font-weight:400;color:var(--fg3);">&mdash; select a template above then customise each section for the job</span></div>'
    +'<div class="biz-field"><label class="biz-label">1. Scope of Works</label><textarea class="biz-textarea" id="agr-f-scope" rows="5" placeholder="Detailed description of all work to be performed..."></textarea></div>'
    +'<div class="biz-field"><label class="biz-label">2. Planned Maintenance</label><textarea class="biz-textarea" id="agr-f-maint-p" rows="4" placeholder="Schedule and content of planned maintenance visits..."></textarea></div>'
    +'<div class="biz-field"><label class="biz-label">3. Unplanned / Reactive Maintenance</label><textarea class="biz-textarea" id="agr-f-maint-u" rows="4" placeholder="Response times and conditions for unplanned fault response..."></textarea></div>'
    +'<div class="biz-field"><label class="biz-label">4. Call-out / Fallout Fees</label><textarea class="biz-textarea" id="agr-f-fees" rows="4" placeholder="Call-out fee schedule with business hours vs after-hours rates..."></textarea></div>'
    +'<div class="biz-field"><label class="biz-label">5. Client Insurance Obligations</label><textarea class="biz-textarea" id="agr-f-ins" rows="3" placeholder="Insurance cover the client must maintain and keep updated..."></textarea></div>'
    +'<div class="biz-field"><label class="biz-label">6. Payment Terms</label><textarea class="biz-textarea" id="agr-f-pay" rows="3" placeholder="Payment schedule, due dates, late payment penalties..."></textarea></div>'
    +'<div class="biz-field"><label class="biz-label">7. Warranty</label><textarea class="biz-textarea" id="agr-f-warranty" rows="3" placeholder="Workmanship and materials warranty terms..."></textarea></div>'
    +'<div class="biz-field"><label class="biz-label">8. General Conditions</label><textarea class="biz-textarea" id="agr-f-gc" rows="4" placeholder="Governing law, access requirements, liability limitations..."></textarea></div>'
    +'<div class="biz-field"><label class="biz-label">Status</label>'
    +'<select class="biz-input" id="agr-f-status"><option value="draft">Draft</option><option value="active">Active / Signed</option><option value="expired">Expired</option><option value="cancelled">Cancelled</option></select></div>'
    +'<p id="agr-modal-err" style="color:#e55;font-size:12px;min-height:14px;"></p>'
    +'<div class="biz-modal-actions">'
    +'<button class="biz-btn biz-btn-primary" onclick="agrSave(null,'+seq+(preLoi?',\''+preLoi.clientId+'\'':',null')+')">Save Agreement</button>'
    +'<button class="biz-btn biz-btn-secondary" onclick="document.getElementById(\'agr-modal\').remove()">Cancel</button>'
    +'</div></div>';
  document.body.appendChild(ov);
  if(preClientId){ var sel=document.getElementById('agr-f-client'); if(sel) sel.value=preClientId; }
  if(preLoi){
    var f=document.getElementById('agr-f-loiref'); if(f) f.value=preLoi.loiNo||'';
    var r=document.getElementById('agr-f-qtref'); if(r) r.value=preLoi.quoteRef||'';
    var v=document.getElementById('agr-f-value'); if(v) v.value=preLoi.value||'';
    var s=document.getElementById('agr-f-start'); if(s) s.value=preLoi.startDate||'';
    var t=document.getElementById('agr-f-svc'); if(t&&!t.value) t.value=preLoi.project||'';
  }
}

function agrTplLoad(key){
  var t=AGR_TEMPLATES[key];
  if(!t) return;
  var map={'agr-f-svc':t.serviceType,'agr-f-scope':t.scope,'agr-f-maint-p':t.plannedMaint,'agr-f-maint-u':t.unplannedMaint,'agr-f-fees':t.calloutFees,'agr-f-ins':t.insuranceReqs,'agr-f-pay':t.paymentTerms,'agr-f-warranty':t.warranty,'agr-f-gc':t.generalConditions};
  Object.keys(map).forEach(function(id){ var el=document.getElementById(id); if(el&&!el.value) el.value=map[id]||''; });
}

function agrEdit(id){
  var a=bizGet('agr_'+id);
  if(!a) return;
  var clients=bizList('cl_');
  var clOpts=clients.map(function(c){ return '<option value="'+c.id+'"'+(a.clientId===c.id?' selected':'')+'>'+esc(c.name)+(c.company?' ('+esc(c.company)+')':'')+'</option>'; }).join('');
  var tplOpts=Object.keys(AGR_TEMPLATES).map(function(k){ return '<option value="'+k+'">'+AGR_TEMPLATES[k].name+'</option>'; }).join('');
  var ov=document.createElement('div');
  ov.className='biz-modal-bg';
  ov.id='agr-modal';
  ov.innerHTML='<div class="biz-modal" style="max-width:720px;">'
    +'<h4>Edit Agreement &mdash; AGR-'+padN(a.seq,4)+'</h4>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
    +'<div class="biz-field"><label class="biz-label">Client</label><select class="biz-input" id="agr-f-client">'+clOpts+'</select></div>'
    +'<div class="biz-field"><label class="biz-label">Re-load Template</label>'
    +'<select class="biz-input" id="agr-f-tpl" onchange="agrTplLoad(this.value)">'
    +'<option value="">-- Overwrites empty fields only --</option>'+tplOpts+'</select></div>'
    +'<div class="biz-field"><label class="biz-label">Service Type</label><input class="biz-input" id="agr-f-svc"></div>'
    +'<div class="biz-field"><label class="biz-label">Site Address</label><input class="biz-input" id="agr-f-site"></div>'
    +'<div class="biz-field"><label class="biz-label">LOI Reference</label><input class="biz-input" id="agr-f-loiref"></div>'
    +'<div class="biz-field"><label class="biz-label">Quote Reference</label><input class="biz-input" id="agr-f-qtref"></div>'
    +'<div class="biz-field"><label class="biz-label">Contract Value (R)</label><input class="biz-input" id="agr-f-value" type="number"></div>'
    +'<div class="biz-field"><label class="biz-label">Start Date</label><input class="biz-input" id="agr-f-start" type="date"></div>'
    +'</div>'
    +'<div class="biz-field"><label class="biz-label">1. Scope of Works</label><textarea class="biz-textarea" id="agr-f-scope" rows="5"></textarea></div>'
    +'<div class="biz-field"><label class="biz-label">2. Planned Maintenance</label><textarea class="biz-textarea" id="agr-f-maint-p" rows="4"></textarea></div>'
    +'<div class="biz-field"><label class="biz-label">3. Unplanned / Reactive Maintenance</label><textarea class="biz-textarea" id="agr-f-maint-u" rows="4"></textarea></div>'
    +'<div class="biz-field"><label class="biz-label">4. Call-out / Fallout Fees</label><textarea class="biz-textarea" id="agr-f-fees" rows="4"></textarea></div>'
    +'<div class="biz-field"><label class="biz-label">5. Client Insurance Obligations</label><textarea class="biz-textarea" id="agr-f-ins" rows="3"></textarea></div>'
    +'<div class="biz-field"><label class="biz-label">6. Payment Terms</label><textarea class="biz-textarea" id="agr-f-pay" rows="3"></textarea></div>'
    +'<div class="biz-field"><label class="biz-label">7. Warranty</label><textarea class="biz-textarea" id="agr-f-warranty" rows="3"></textarea></div>'
    +'<div class="biz-field"><label class="biz-label">8. General Conditions</label><textarea class="biz-textarea" id="agr-f-gc" rows="4"></textarea></div>'
    +'<div class="biz-field"><label class="biz-label">Status</label>'
    +'<select class="biz-input" id="agr-f-status">'
    +['draft','active','expired','cancelled'].map(function(s){ return '<option value="'+s+'"'+(a.status===s?' selected':'')+'>'+s+'</option>'; }).join('')
    +'</select></div>'
    +'<p id="agr-modal-err" style="color:#e55;font-size:12px;min-height:14px;"></p>'
    +'<div class="biz-modal-actions">'
    +'<button class="biz-btn biz-btn-primary" onclick="agrSave(\''+id+'\','+a.seq+',\''+a.clientId+'\')">Save</button>'
    +'<button class="biz-btn biz-btn-secondary" onclick="document.getElementById(\'agr-modal\').remove()">Cancel</button>'
    +'</div></div>';
  document.body.appendChild(ov);
  var vals={'agr-f-svc':a.serviceType||'','agr-f-site':a.siteAddress||'','agr-f-loiref':a.loiRef||'','agr-f-qtref':a.qtRef||'','agr-f-value':a.contractValue||'','agr-f-start':a.startDate||'','agr-f-scope':a.scope||'','agr-f-maint-p':a.plannedMaint||'','agr-f-maint-u':a.unplannedMaint||'','agr-f-fees':a.calloutFees||'','agr-f-ins':a.insuranceReqs||'','agr-f-pay':a.paymentTerms||'','agr-f-warranty':a.warranty||'','agr-f-gc':a.generalConditions||''};
  Object.keys(vals).forEach(function(id){ var el=document.getElementById(id); if(el) el.value=vals[id]; });
}

function agrSave(id,seq,preClientId){
  var svc=(document.getElementById('agr-f-svc').value||'').trim();
  if(!svc){ document.getElementById('agr-modal-err').textContent='Service type is required.'; return; }
  var clientId=(document.getElementById('agr-f-client')||{}).value||preClientId||'';
  var client=bizGet('cl_'+clientId)||{};
  var aid=id||('agr_'+Date.now());
  var existing=bizGet('agr_'+aid)||{createdAt:Date.now()};
  var rec=Object.assign(existing,{
    id:aid,seq:seq,agreementNo:'AGR-'+padN(seq,4),
    clientId:clientId,clientName:client.name||'',
    serviceType:svc,
    siteAddress:(document.getElementById('agr-f-site').value||'').trim(),
    loiRef:(document.getElementById('agr-f-loiref').value||'').trim(),
    qtRef:(document.getElementById('agr-f-qtref').value||'').trim(),
    contractValue:parseFloat(document.getElementById('agr-f-value').value)||0,
    startDate:(document.getElementById('agr-f-start').value||''),
    scope:(document.getElementById('agr-f-scope').value||'').trim(),
    plannedMaint:(document.getElementById('agr-f-maint-p').value||'').trim(),
    unplannedMaint:(document.getElementById('agr-f-maint-u').value||'').trim(),
    calloutFees:(document.getElementById('agr-f-fees').value||'').trim(),
    insuranceReqs:(document.getElementById('agr-f-ins').value||'').trim(),
    paymentTerms:(document.getElementById('agr-f-pay').value||'').trim(),
    warranty:(document.getElementById('agr-f-warranty').value||'').trim(),
    generalConditions:(document.getElementById('agr-f-gc').value||'').trim(),
    status:(document.getElementById('agr-f-status').value||'draft')
  });
  bizSet('agr_'+aid,rec);
  document.getElementById('agr-modal').remove();
  agrRender();
}

function agrFromLoi(loiId){
  var l=bizGet('loi_'+loiId);
  if(!l) return;
  hubShow('hub-agr',document.querySelector('.hub-nav-btn[onclick*="hub-agr"]'));
  agrNew(l.clientId,loiId);
}

function agrPrint(id){
  var a=bizGet('agr_'+id);
  if(!a) return;
  var client=bizGet('cl_'+a.clientId)||{};
  function agrSec(num,title,content){
    if(!content) return '';
    return '<div style="margin-bottom:22px;page-break-inside:avoid;">'
      +'<div style="font-size:11px;font-weight:800;color:#1E8540;text-transform:uppercase;letter-spacing:.07em;border-bottom:2px solid #1E8540;padding-bottom:4px;margin-bottom:9px;">Section '+num+' &mdash; '+title+'</div>'
      +'<div style="font-size:12.5px;line-height:1.8;white-space:pre-line;color:#222;">'+esc(content)+'</div>'
      +'</div>';
  }
  var statusCol={'draft':'#e67e22','active':'#1E8540','expired':'#888','cancelled':'#c0392b'}[a.status]||'#888';
  var html='<div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;padding:30px 24px;color:#222;">'
    +'<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #1E8540;">'
    +'<div><div style="font-size:24px;font-weight:900;color:#1E8540;letter-spacing:-.5px;">RIBA T TSEKE</div>'
    +'<div style="font-size:11px;color:#555;margin-top:3px;">Installation Electrician (DoEL)</div>'
    +'<div style="font-size:11px;color:#555;">072 474 8888 &middot; ribattseke@gmail.com &middot; ribattseke.co.za</div></div>'
    +'<div style="text-align:right;">'
    +'<div style="font-size:20px;font-weight:900;color:#1E8540;">WORKS AGREEMENT</div>'
    +'<div style="font-size:14px;font-weight:800;margin-top:2px;">AGR-'+padN(a.seq,4)+'</div>'
    +'<div style="font-size:11px;color:#666;margin-top:2px;">Date: '+bizDateStr(a.createdAt)+'</div>'
    +'<div style="font-size:11px;font-weight:800;color:'+statusCol+';margin-top:3px;letter-spacing:.05em;">'+a.status.toUpperCase()+'</div>'
    +'</div></div>'
    +'<div style="background:#f8f8f8;border:1px solid #ddd;border-radius:6px;padding:14px 16px;margin-bottom:22px;">'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:12px;">'
    +'<div><div style="font-size:10px;font-weight:800;letter-spacing:.08em;color:#888;margin-bottom:4px;">PROVIDER</div>'
    +'<div style="font-size:13px;font-weight:800;">Riba T Tseke</div>'
    +'<div style="font-size:11.5px;color:#555;">Installation Electrician (DoEL)</div>'
    +'<div style="font-size:11.5px;color:#555;">ECASA Member &middot; Reg. Electrician</div>'
    +'<div style="font-size:11.5px;color:#555;">Gauteng, South Africa</div></div>'
    +'<div><div style="font-size:10px;font-weight:800;letter-spacing:.08em;color:#888;margin-bottom:4px;">CLIENT</div>'
    +'<div style="font-size:13px;font-weight:800;">'+esc(client.name||a.clientName||'')+'</div>'
    +(client.company?'<div style="font-size:11.5px;color:#555;">'+esc(client.company)+'</div>':'')
    +(client.address?'<div style="font-size:11.5px;color:#555;white-space:pre-line;">'+esc(client.address)+'</div>':'')
    +(client.phone?'<div style="font-size:11.5px;color:#555;">'+esc(client.phone)+'</div>':'')
    +'</div></div>'
    +'<div style="border-top:1px solid #ddd;padding-top:10px;display:flex;flex-wrap:wrap;gap:16px;">'
    +(a.siteAddress?'<div><div style="font-size:9.5px;font-weight:700;color:#888;letter-spacing:.05em;">SITE ADDRESS</div><div style="font-size:11.5px;font-weight:700;">'+esc(a.siteAddress)+'</div></div>':'')
    +'<div><div style="font-size:9.5px;font-weight:700;color:#888;letter-spacing:.05em;">SERVICE</div><div style="font-size:11.5px;font-weight:700;">'+esc(a.serviceType||'')+'</div></div>'
    +(a.loiRef?'<div><div style="font-size:9.5px;font-weight:700;color:#888;letter-spacing:.05em;">LOI REF</div><div style="font-size:11.5px;font-weight:700;">'+esc(a.loiRef)+'</div></div>':'')
    +(a.qtRef?'<div><div style="font-size:9.5px;font-weight:700;color:#888;letter-spacing:.05em;">QUOTE REF</div><div style="font-size:11.5px;font-weight:700;">'+esc(a.qtRef)+'</div></div>':'')
    +(a.contractValue?'<div><div style="font-size:9.5px;font-weight:700;color:#888;letter-spacing:.05em;">CONTRACT VALUE</div><div style="font-size:11.5px;font-weight:700;color:#1E8540;">R '+fmtMoney(a.contractValue)+'</div></div>':'')
    +(a.startDate?'<div><div style="font-size:9.5px;font-weight:700;color:#888;letter-spacing:.05em;">START DATE</div><div style="font-size:11.5px;font-weight:700;">'+esc(a.startDate)+'</div></div>':'')
    +'</div></div>'
    +'<p style="font-size:12.5px;line-height:1.75;margin-bottom:22px;color:#333;">This Works Agreement ("<strong>Agreement</strong>") is entered into between <strong>Riba T Tseke</strong> ("<strong>Provider</strong>") and <strong>'+esc(client.name||a.clientName||'the Client')+'</strong> ("<strong>Client</strong>"), effective from the date of signature by both parties. The Agreement sets out the scope of works, maintenance obligations, fees, insurance requirements and general conditions governing the services described below.</p>'
    +agrSec('1','Scope of Works',a.scope)
    +agrSec('2','Planned Maintenance',a.plannedMaint)
    +agrSec('3','Unplanned / Reactive Maintenance',a.unplannedMaint)
    +agrSec('4','Call-out / Fallout Fees',a.calloutFees)
    +agrSec('5','Client Insurance Obligations',a.insuranceReqs)
    +agrSec('6','Payment Terms',a.paymentTerms)
    +agrSec('7','Warranty',a.warranty)
    +agrSec('8','General Conditions',a.generalConditions)
    +'<div style="margin-top:30px;border-top:2px solid #1E8540;padding-top:20px;">'
    +'<div style="font-size:11px;font-weight:800;color:#1E8540;text-transform:uppercase;letter-spacing:.07em;margin-bottom:18px;">Signatures &mdash; Both parties confirm they have read, understood and accept all terms of this Works Agreement</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;">'
    +'<div>'
    +'<div style="font-size:10.5px;color:#888;text-transform:uppercase;letter-spacing:.05em;margin-bottom:28px;">For Riba T Tseke</div>'
    +'<div style="border-top:1px solid #999;width:240px;margin-bottom:5px;"></div>'
    +'<div style="font-size:11px;color:#444;">Name: Tseke Riba</div>'
    +'<div style="font-size:11px;color:#444;margin-top:3px;">Designation: Installation Electrician (DoEL)</div>'
    +'<div style="font-size:11px;color:#444;margin-top:3px;">Date: ___________________________</div>'
    +'</div>'
    +'<div>'
    +'<div style="font-size:10.5px;color:#888;text-transform:uppercase;letter-spacing:.05em;margin-bottom:28px;">Client Signature</div>'
    +'<div style="border-top:1px solid #999;width:240px;margin-bottom:5px;"></div>'
    +'<div style="font-size:11px;color:#444;">Name: ___________________________</div>'
    +'<div style="font-size:11px;color:#444;margin-top:3px;">ID / Reg No: ___________________________</div>'
    +'<div style="font-size:11px;color:#444;margin-top:3px;">Capacity: ___________________________</div>'
    +'<div style="font-size:11px;color:#444;margin-top:3px;">Date: ___________________________</div>'
    +'</div></div>'
    +'<div style="margin-top:12px;font-size:10px;color:#aaa;border-top:1px solid #eee;padding-top:8px;">This document is confidential. Riba T Tseke &middot; Gauteng, South Africa &middot; ribattseke.co.za &middot; AGR-'+padN(a.seq,4)+'</div>'
    +'</div></div>';
  doPrintDoc(html,'AGR-'+padN(a.seq,4));
}

/* ===========================================
   INVOICES
   =========================================== */
function invRender(){
  var q=(document.getElementById('inv-search')||{}).value||'';
  var list=bizList('inv_');
  if(q) list=list.filter(function(x){ return (x.invNo+''+x.clientName+x.serviceType).toLowerCase().indexOf(q.toLowerCase())>-1; });
  var el=document.getElementById('inv-list');
  if(!el) return;
  if(!list.length){ el.innerHTML='<p style="font-size:13px;color:var(--fg3);text-align:center;padding:20px 0;">No invoices yet.</p>'; return; }
  var totalOutstanding=0,totalPaid=0;
  list.forEach(function(i){ if(i.status==='paid') totalPaid+=i.total; else totalOutstanding+=i.total; });
  el.innerHTML='<div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;">'
    +'<div class="biz-card" style="flex:1;min-width:140px;text-align:center;padding:12px;">'
    +'<div style="font-size:11px;color:var(--fg3);">Outstanding</div>'
    +'<div style="font-size:20px;font-weight:800;color:#c0392b;">R '+fmtMoney(totalOutstanding)+'</div></div>'
    +'<div class="biz-card" style="flex:1;min-width:140px;text-align:center;padding:12px;">'
    +'<div style="font-size:11px;color:var(--fg3);">Collected</div>'
    +'<div style="font-size:20px;font-weight:800;color:#1a7a3c;">R '+fmtMoney(totalPaid)+'</div></div>'
    +'</div>'
    +list.map(function(inv){
      var sb={'unpaid':'biz-badge-orange','paid':'biz-badge-green','partial':'biz-badge-blue','cancelled':'biz-badge-red'}[inv.status]||'biz-badge-grey';
      return '<div class="biz-card">'
        +'<div class="biz-card-row">'
        +'<div><div class="biz-card-title">INV-'+padN(inv.seq,4)+' &mdash; '+esc(inv.clientName||'')+'</div>'
        +'<div class="biz-card-sub">'+esc(inv.serviceType||'')+'</div>'
        +'<div class="biz-card-sub">'+bizDateStr(inv.createdAt)+' &middot; <strong>R'+fmtMoney(inv.total)+'</strong></div></div>'
        +'<span class="biz-badge '+sb+'">'+inv.status+'</span>'
        +'</div>'
        +'<div class="biz-card-actions">'
        +'<button class="biz-btn biz-btn-secondary" onclick="invEdit(\''+inv.id+'\')">Edit</button>'
        +'<button class="biz-btn biz-btn-primary" onclick="invPrint(\''+inv.id+'\')">Print / PDF</button>'
        +'<button class="biz-btn '+(inv.status==='paid'?'biz-btn-secondary':'biz-btn-primary')+'" onclick="invMarkPaid(\''+inv.id+'\')">'+((inv.status==='paid')?'Mark Unpaid':'Mark Paid')+'</button>'
        +'<button class="biz-btn biz-btn-danger" onclick="bizDelConfirm(\'inv_'+inv.id+'\',invRender)">Del</button>'
        +'</div></div>';
    }).join('');
}

function invNew(preClientId,preItems,preTotal,preService,preSeqFromQt){
  var clients=bizList('cl_');
  var clOpts=clients.map(function(c){ return '<option value="'+c.id+'"'+(preClientId===c.id?' selected':'')+'>'+esc(c.name)+(c.company?' ('+esc(c.company)+')':'')+'</option>'; }).join('');
  var seq=bizNextSeq('inv');
  var ov=document.createElement('div');
  ov.className='biz-modal-bg';
  ov.id='inv-modal';
  ov.innerHTML='<div class="biz-modal">'
    +'<h4>New Invoice &mdash; INV-'+padN(seq,4)+'</h4>'
    +'<div class="biz-field"><label class="biz-label">Client *</label>'
    +'<select class="biz-input" id="inv-f-client">'+(clOpts||'<option value="">-- Add a client first --</option>')+'</select></div>'
    +'<div class="biz-field"><label class="biz-label">Service / Description *</label><input class="biz-input" id="inv-f-service" value="'+esc(preService||'')+'"></div>'
    +'<div class="biz-field"><label class="biz-label">Invoice Date</label><input class="biz-input" id="inv-f-date" type="date" value="'+bizDateStr(Date.now())+'"></div>'
    +'<div class="biz-field"><label class="biz-label">Due Date</label><input class="biz-input" id="inv-f-due" type="date"></div>'
    +'<div class="biz-field"><label class="biz-label">Line Items</label>'
    +'<table class="li-table" id="inv-li-table">'
    +'<thead><tr><th style="width:40%">Description</th><th style="width:10%">Qty</th><th style="width:14%">Unit</th><th style="width:16%">Rate (R)</th><th style="width:14%">Amount</th><th></th></tr></thead>'
    +'<tbody id="inv-li-body"></tbody></table>'
    +'<button class="biz-btn biz-btn-secondary" style="margin-top:5px;font-size:11px;" onclick="invAddRow()">+ Add Row</button></div>'
    +'<div class="li-totals" id="inv-totals"></div>'
    +'<div class="biz-field"><label class="biz-label">VAT</label>'
    +'<select class="biz-input" id="inv-f-vat" onchange="invCalc()"><option value="0">No VAT (0%)</option><option value="15">Include VAT (15%)</option></select></div>'
    +'<div class="biz-field"><label class="biz-label">Payment Reference</label><input class="biz-input" id="inv-f-ref" placeholder="e.g. INV-0001 or client name"></div>'
    +'<div class="biz-field"><label class="biz-label">Notes</label><textarea class="biz-textarea" id="inv-f-notes"></textarea></div>'
    +'<div class="biz-field"><label class="biz-label">Status</label>'
    +'<select class="biz-input" id="inv-f-status"><option value="unpaid">Unpaid</option><option value="partial">Partially Paid</option><option value="paid">Paid</option><option value="cancelled">Cancelled</option></select></div>'
    +'<p id="inv-modal-err" style="color:#e55;font-size:12px;min-height:14px;"></p>'
    +'<div class="biz-modal-actions">'
    +'<button class="biz-btn biz-btn-primary" onclick="invSave(null,'+seq+')">Save Invoice</button>'
    +'<button class="biz-btn biz-btn-secondary" onclick="document.getElementById(\'inv-modal\').remove()">Cancel</button>'
    +'</div></div>';
  document.body.appendChild(ov);
  if(preItems && preItems.length){ preItems.forEach(function(it){ invAddRow(it); }); }
  else { invAddRow(); }
  invCalc();
}

function invFromQt(qtId){
  var q=bizGet('qt_'+qtId);
  if(!q) return;
  hubShow('hub-invoices',document.querySelector('.hub-nav-btn[onclick*="hub-invoices"]'));
  invNew(q.clientId,q.items,q.total,q.serviceType,q.seq);
}

function invAddRow(it){
  it=it||{desc:'',qty:1,unit:'Each',rate:0};
  var tbody=document.getElementById('inv-li-body');
  if(!tbody) return;
  var tr=document.createElement('tr');
  tr.innerHTML='<td><input value="'+esc(it.desc)+'" onchange="invCalc()" oninput="invCalc()"></td>'
    +'<td><input type="number" value="'+it.qty+'" min="0" step="any" onchange="invCalc()" oninput="invCalc()" style="text-align:right;"></td>'
    +'<td><input value="'+esc(it.unit||'Each')+'"></td>'
    +'<td><input type="number" value="'+it.rate+'" min="0" step="any" onchange="invCalc()" oninput="invCalc()" style="text-align:right;"></td>'
    +'<td class="inv-amt" style="text-align:right;font-size:12px;">R0</td>'
    +'<td><button onclick="this.closest(\'tr\').remove();invCalc();" style="border:none;background:none;color:#c0392b;cursor:pointer;font-size:14px;">&times;</button></td>';
  tbody.appendChild(tr);
  invCalc();
}

function invCalc(){
  var tbody=document.getElementById('inv-li-body');
  if(!tbody) return;
  var subtotal=0;
  tbody.querySelectorAll('tr').forEach(function(tr){
    var inputs=tr.querySelectorAll('input');
    var qty=parseFloat(inputs[1].value)||0;
    var rate=parseFloat(inputs[3].value)||0;
    var amt=qty*rate;
    subtotal+=amt;
    tr.querySelector('.inv-amt').textContent='R'+fmtMoney(amt);
  });
  var vatRate=parseInt((document.getElementById('inv-f-vat')||{}).value||'0');
  var vat=subtotal*vatRate/100;
  var total=subtotal+vat;
  var el=document.getElementById('inv-totals');
  if(el) el.innerHTML='Subtotal: <strong>R'+fmtMoney(subtotal)+'</strong>'
    +(vatRate?'<br>VAT ('+vatRate+'%): <strong>R'+fmtMoney(vat)+'</strong>':'')
    +'<br><span style="font-size:15px;">TOTAL: <strong style="font-size:17px;color:var(--amb);">R'+fmtMoney(total)+'</strong></span>';
}

function invEdit(id){
  var inv=bizGet('inv_'+id);
  if(!inv) return;
  var clients=bizList('cl_');
  var clOpts=clients.map(function(c){ return '<option value="'+c.id+'"'+(inv.clientId===c.id?' selected':'')+'>'+esc(c.name)+(c.company?' ('+esc(c.company)+')':'')+'</option>'; }).join('');
  var ov=document.createElement('div');
  ov.className='biz-modal-bg';
  ov.id='inv-modal';
  ov.innerHTML='<div class="biz-modal">'
    +'<h4>Edit Invoice &mdash; INV-'+padN(inv.seq,4)+'</h4>'
    +'<div class="biz-field"><label class="biz-label">Client</label><select class="biz-input" id="inv-f-client">'+clOpts+'</select></div>'
    +'<div class="biz-field"><label class="biz-label">Service / Description *</label><input class="biz-input" id="inv-f-service" value="'+esc(inv.serviceType||'')+'"></div>'
    +'<div class="biz-field"><label class="biz-label">Invoice Date</label><input class="biz-input" id="inv-f-date" type="date" value="'+esc(inv.invDate||bizDateStr(inv.createdAt))+'"></div>'
    +'<div class="biz-field"><label class="biz-label">Due Date</label><input class="biz-input" id="inv-f-due" type="date" value="'+esc(inv.dueDate||'')+'"></div>'
    +'<div class="biz-field"><label class="biz-label">Line Items</label>'
    +'<table class="li-table" id="inv-li-table"><thead><tr><th style="width:40%">Description</th><th style="width:10%">Qty</th><th style="width:14%">Unit</th><th style="width:16%">Rate (R)</th><th style="width:14%">Amount</th><th></th></tr></thead>'
    +'<tbody id="inv-li-body"></tbody></table>'
    +'<button class="biz-btn biz-btn-secondary" style="margin-top:5px;font-size:11px;" onclick="invAddRow()">+ Add Row</button></div>'
    +'<div class="li-totals" id="inv-totals"></div>'
    +'<div class="biz-field"><label class="biz-label">VAT</label>'
    +'<select class="biz-input" id="inv-f-vat" onchange="invCalc()"><option value="0"'+((!inv.vatRate||inv.vatRate===0)?' selected':'')+'>No VAT (0%)</option><option value="15"'+(inv.vatRate===15?' selected':'')+'>Include VAT (15%)</option></select></div>'
    +'<div class="biz-field"><label class="biz-label">Payment Reference</label><input class="biz-input" id="inv-f-ref" value="'+esc(inv.payRef||'')+'"></div>'
    +'<div class="biz-field"><label class="biz-label">Notes</label><textarea class="biz-textarea" id="inv-f-notes">'+esc(inv.notes||'')+'</textarea></div>'
    +'<div class="biz-field"><label class="biz-label">Status</label>'
    +'<select class="biz-input" id="inv-f-status">'
    +['unpaid','partial','paid','cancelled'].map(function(s){ return '<option value="'+s+'"'+(inv.status===s?' selected':'')+'>'+s+'</option>'; }).join('')
    +'</select></div>'
    +'<p id="inv-modal-err" style="color:#e55;font-size:12px;min-height:14px;"></p>'
    +'<div class="biz-modal-actions">'
    +'<button class="biz-btn biz-btn-primary" onclick="invSave(\''+id+'\','+inv.seq+')">Save</button>'
    +'<button class="biz-btn biz-btn-secondary" onclick="document.getElementById(\'inv-modal\').remove()">Cancel</button>'
    +'</div></div>';
  document.body.appendChild(ov);
  (inv.items||[]).forEach(function(it){ invAddRow(it); });
  invCalc();
}

function invSave(id,seq){
  var svc=(document.getElementById('inv-f-service').value||'').trim();
  if(!svc){ document.getElementById('inv-modal-err').textContent='Service description is required.'; return; }
  var clientId=(document.getElementById('inv-f-client')||{}).value||'';
  var client=bizGet('cl_'+clientId)||{};
  var tbody=document.getElementById('inv-li-body');
  var items=[];
  tbody.querySelectorAll('tr').forEach(function(tr){
    var inputs=tr.querySelectorAll('input');
    items.push({desc:inputs[0].value,qty:parseFloat(inputs[1].value)||0,unit:inputs[2].value,rate:parseFloat(inputs[3].value)||0});
  });
  var subtotal=items.reduce(function(s,it){ return s+it.qty*it.rate; },0);
  var vatRate=parseInt((document.getElementById('inv-f-vat')||{}).value||'0');
  var vat=subtotal*vatRate/100;
  var total=subtotal+vat;
  var iid=id||('inv_'+Date.now());
  var existing=bizGet('inv_'+iid)||{createdAt:Date.now()};
  var rec=Object.assign(existing,{
    id:iid,seq:seq,invNo:'INV-'+padN(seq,4),
    clientId:clientId,clientName:client.name||'',
    serviceType:svc,
    invDate:(document.getElementById('inv-f-date').value||bizDateStr(Date.now())),
    dueDate:(document.getElementById('inv-f-due').value||''),
    payRef:(document.getElementById('inv-f-ref').value||'').trim(),
    notes:(document.getElementById('inv-f-notes').value||'').trim(),
    status:(document.getElementById('inv-f-status').value||'unpaid'),
    items:items,subtotal:subtotal,vatRate:vatRate,vat:vat,total:total
  });
  bizSet('inv_'+iid,rec);
  document.getElementById('inv-modal').remove();
  invRender();
}

function invMarkPaid(id){
  var inv=bizGet('inv_'+id);
  if(!inv) return;
  inv.status=inv.status==='paid'?'unpaid':'paid';
  bizSet('inv_'+id,inv);
  invRender();
}

function invPrint(id){
  var inv=bizGet('inv_'+id);
  if(!inv) return;
  var client=bizGet('cl_'+inv.clientId)||{};
  var rows=(inv.items||[]).map(function(it,i){
    return '<tr style="border-bottom:1px solid #e0d8cc;">'
      +'<td style="padding:5px 8px;font-size:12px;">'+(i+1)+'</td>'
      +'<td style="padding:5px 8px;font-size:12px;">'+esc(it.desc)+'</td>'
      +'<td style="padding:5px 8px;font-size:12px;text-align:right;">'+it.qty+'</td>'
      +'<td style="padding:5px 8px;font-size:12px;">'+esc(it.unit||'')+'</td>'
      +'<td style="padding:5px 8px;font-size:12px;text-align:right;">R '+fmtMoney(it.rate)+'</td>'
      +'<td style="padding:5px 8px;font-size:12px;text-align:right;font-weight:600;">R '+fmtMoney(it.qty*it.rate)+'</td>'
      +'</tr>';
  }).join('');
  var statusColor={'unpaid':'#c0392b','paid':'#1a7a3c','partial':'#1a4b8c','cancelled':'#888'}[inv.status]||'#888';
  var html='<div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;padding:30px 24px;color:#222;">'
    +'<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;">'
    +'<div><div style="font-size:22px;font-weight:800;color:#1E8540;">RIBA T TSEKE</div>'
    +'<div style="font-size:11px;color:#666;margin-top:3px;">Installation Electrician (DoEL)</div>'
    +'<div style="font-size:11px;color:#666;">072 474 8888 &middot; ribattseke@gmail.com &middot; ribattseke.co.za</div>'
    +'<div style="margin-top:8px;font-size:11.5px;"><strong>Banking:</strong> Capitec &middot; Tseke Riba &middot; 2605150883 &middot; Branch 470010<br>PayShap: 072 474 8888</div></div>'
    +'<div style="text-align:right;">'
    +'<div style="font-size:20px;font-weight:800;color:#1E8540;letter-spacing:.05em;">INVOICE</div>'
    +'<div style="font-size:13px;font-weight:700;">'+inv.invNo+'</div>'
    +'<div style="font-size:11px;color:#666;">Date: '+inv.invDate+'</div>'
    +(inv.dueDate?'<div style="font-size:11px;color:#c0392b;">Due: '+inv.dueDate+'</div>':'')
    +'<div style="font-size:11px;font-weight:700;color:'+statusColor+';margin-top:4px;text-transform:uppercase;">'+inv.status+'</div>'
    +'</div></div>'
    +'<div style="background:#f7f4ef;border-radius:8px;padding:12px 14px;margin-bottom:20px;">'
    +'<div style="font-size:10px;font-weight:700;letter-spacing:.06em;color:#888;margin-bottom:5px;">BILL TO</div>'
    +'<div style="font-size:13.5px;font-weight:700;">'+esc(client.name||inv.clientName||'')+'</div>'
    +(client.company?'<div style="font-size:12px;">'+esc(client.company)+'</div>':'')
    +(client.address?'<div style="font-size:12px;white-space:pre-line;">'+esc(client.address)+'</div>':'')
    +(client.phone?'<div style="font-size:12px;">'+esc(client.phone)+'</div>':'')
    +(client.vat?'<div style="font-size:12px;">VAT: '+esc(client.vat)+'</div>':'')
    +'</div>'
    +'<div style="font-size:13px;font-weight:700;margin-bottom:8px;color:#1E8540;">'+esc(inv.serviceType)+'</div>'
    +'<table style="width:100%;border-collapse:collapse;margin-bottom:12px;">'
    +'<thead><tr style="background:#1E8540;color:#fff;">'
    +'<th style="padding:7px 8px;text-align:left;font-size:11px;">#</th>'
    +'<th style="padding:7px 8px;text-align:left;font-size:11px;">Description</th>'
    +'<th style="padding:7px 8px;text-align:right;font-size:11px;">Qty</th>'
    +'<th style="padding:7px 8px;text-align:left;font-size:11px;">Unit</th>'
    +'<th style="padding:7px 8px;text-align:right;font-size:11px;">Rate</th>'
    +'<th style="padding:7px 8px;text-align:right;font-size:11px;">Amount</th>'
    +'</tr></thead><tbody>'+rows+'</tbody></table>'
    +'<div style="text-align:right;font-size:13px;line-height:2;">'
    +'Subtotal: <strong>R '+fmtMoney(inv.subtotal)+'</strong><br>'
    +(inv.vatRate?'VAT ('+inv.vatRate+'%): <strong>R '+fmtMoney(inv.vat)+'</strong><br>':'')
    +'<span style="font-size:16px;font-weight:800;">TOTAL DUE: R '+fmtMoney(inv.total)+'</span></div>'
    +(inv.payRef?'<div style="margin-top:10px;font-size:12.5px;">Payment Reference: <strong>'+esc(inv.payRef)+'</strong></div>':'')
    +(inv.notes?'<div style="margin-top:12px;background:#f7f4ef;border-radius:8px;padding:12px 14px;font-size:12.5px;color:#444;"><strong>Notes:</strong><br>'+esc(inv.notes).replace(/\n/g,'<br>')+'</div>':'')
    +'<div style="margin-top:16px;font-size:10.5px;color:#999;text-align:center;">Thank you for your business. E&amp;OE. Queries: ribattseke@gmail.com &middot; 072 474 8888</div>'
    +'</div>';
  doPrintDoc(html,'Invoice '+inv.invNo);
}

/* ---- Shared util ---- */
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtMoney(n){ return Number(n||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,','); }
function bizDelConfirm(storageKey,cb){
  var ov=document.createElement('div');
  ov.className='biz-modal-bg';
  ov.innerHTML='<div class="biz-modal"><h4>Delete Record</h4><p style="font-size:13.5px;color:var(--fg2);">Are you sure? This cannot be undone.</p>'
    +'<div class="biz-modal-actions">'
    +'<button class="biz-btn biz-btn-danger" onclick="bizDel(\''+storageKey+'\');this.closest(\'.biz-modal-bg\').remove();if(typeof '+cb.name+'===\'function\')'+cb.name+'();">Delete</button>'
    +'<button class="biz-btn biz-btn-secondary" onclick="this.closest(\'.biz-modal-bg\').remove()">Cancel</button>'
    +'</div></div>';
  document.body.appendChild(ov);
}


/* ═══════════════════════════════════════════════════════════
   PHASE 2 — JOB CARDS
   ═══════════════════════════════════════════════════════════ */
/* ===================================================
   ENGAGEMENT POPUPS — Google Review + Donate
   =================================================== */
var GOOGLE_REVIEW_URL='https://g.page/r/CYJdVjVsHkLBEBM/review';
var LMS_ENGAGE_NS='lms_engage_';

function showCompanionOrder(){
  if(document.getElementById('companion-order-overlay')) return;
  var el=document.createElement('div');
  el.id='companion-order-overlay';
  el.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px;';
  el.innerHTML='<div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;max-width:380px;width:100%;padding:22px 20px 18px;box-shadow:0 8px 32px rgba(0,0,0,.18);position:relative;">'
    +'<button onclick="document.getElementById(\'companion-order-overlay\').remove()" style="position:absolute;top:10px;right:12px;background:none;border:none;font-size:20px;color:var(--fg3);cursor:pointer;line-height:1;">×</button>'
    +'<h4 style="margin:0 0 4px;font-family:\'Playfair Display\',serif;font-size:17px;color:var(--fg);">Order: Installation Rules Companion</h4>'
    +'<p style="font-size:12px;color:var(--fg3);margin:0 0 14px;">Enter your details. Tseke will confirm and send your quote before anything is processed.</p>'
    +'<label style="font-size:11.5px;font-weight:700;color:var(--fg2);display:block;margin-bottom:3px;">Full Name</label>'
    +'<input id="co-name" type="text" placeholder="Your full name" style="width:100%;box-sizing:border-box;border:1px solid var(--border);border-radius:7px;padding:8px 10px;font-size:13px;background:var(--bg);color:var(--fg);margin-bottom:10px;">'
    +'<label style="font-size:11.5px;font-weight:700;color:var(--fg2);display:block;margin-bottom:3px;">Cell Number</label>'
    +'<input id="co-cell" type="tel" placeholder="e.g. 072 123 4567" style="width:100%;box-sizing:border-box;border:1px solid var(--border);border-radius:7px;padding:8px 10px;font-size:13px;background:var(--bg);color:var(--fg);margin-bottom:10px;">'
    +'<label style="font-size:11.5px;font-weight:700;color:var(--fg2);display:block;margin-bottom:3px;">Delivery Address (or Digital / WhatsApp delivery)</label>'
    +'<textarea id="co-addr" rows="2" placeholder="Street, suburb, city - or type: Digital delivery" style="width:100%;box-sizing:border-box;border:1px solid var(--border);border-radius:7px;padding:8px 10px;font-size:13px;background:var(--bg);color:var(--fg);resize:vertical;margin-bottom:12px;"></textarea>'
    +'<div id="co-err" style="color:#c00;font-size:12px;margin-bottom:6px;"></div>'
    +'<button onclick="submitCompanionOrder()" style="width:100%;padding:11px;background:var(--amb);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:6px;">Send Order Request</button>'
    +'<button onclick="document.getElementById(\'companion-order-overlay\').remove()" style="width:100%;padding:9px;background:none;border:1px solid var(--border);border-radius:8px;font-size:13px;color:var(--fg2);cursor:pointer;">Cancel</button>'
    +'</div>';
  document.body.appendChild(el);
}
function submitCompanionOrder(){
  var name=(document.getElementById('co-name').value||'').trim();
  var cell=(document.getElementById('co-cell').value||'').trim();
  var addr=(document.getElementById('co-addr').value||'').trim();
  var err=document.getElementById('co-err');
  if(!name){err.textContent='Please enter your full name.';return;}
  if(!cell){err.textContent='Please enter your cell number.';return;}
  err.textContent='';
  // Save order to localStorage for admin hub
  var order={id:'ORD-'+Date.now(),type:'companion',name:name,cell:cell,addr:addr||'Not specified',item:'Installation Rules Companion',status:'Pending Quote',ts:Date.now()};
  try{
    var orders=JSON.parse(localStorage.getItem('biz_companion_orders')||'[]');
    orders.unshift(order);
    localStorage.setItem('biz_companion_orders',JSON.stringify(orders));
  }catch(e){}
  // Open WhatsApp
  var msg='Hi Tseke%2C I would like to order the Installation Rules Companion Pack.%0A%0AName: '+encodeURIComponent(name)+'%0ACell: '+encodeURIComponent(cell)+'%0ADelivery: '+encodeURIComponent(addr||'Digital delivery')+'%0AItem: Installation Rules Companion%0ARef: '+order.id;
  window.open('https://wa.me/27724748888?text='+msg,'_blank');
  document.getElementById('companion-order-overlay').remove();
}

function engageCheckPopups(){
  // Don't interrupt login or quiz flow — only on the dashboard
  var isDash=document.getElementById('lms-dash')&&document.getElementById('lms-dash').classList.contains('active');
  if(!isDash) return;
  // Google review: show once per device (not shown if already dismissed with "Done")
  var reviewed=false;
  try{reviewed=!!localStorage.getItem(LMS_ENGAGE_NS+'reviewed');}catch(e){}
  if(!reviewed){
    var lastAskTs=0;
    try{lastAskTs=parseInt(localStorage.getItem(LMS_ENGAGE_NS+'review_asked_ts')||'0');}catch(e){}
    // Show after 3 visits or if never shown; then every 7 days max until they click "Done"
    var visitCount=0;
    try{visitCount=parseInt(localStorage.getItem(LMS_ENGAGE_NS+'visit_count')||'0');}catch(e){}
    visitCount++;
    try{localStorage.setItem(LMS_ENGAGE_NS+'visit_count',String(visitCount));}catch(e){}
    var daysSinceLast=(Date.now()-lastAskTs)/(24*60*60*1000);
    if(visitCount>=3 && (lastAskTs===0 || daysSinceLast>=7)){
      try{localStorage.setItem(LMS_ENGAGE_NS+'review_asked_ts',String(Date.now()));}catch(e){}
      setTimeout(function(){ engageShowReview(); },4000);
      return;
    }
  }
  // Donate: show every 5 visits, with a 2-day cool-down
  var lastDonateTs=0;
  try{lastDonateTs=parseInt(localStorage.getItem(LMS_ENGAGE_NS+'donate_ts')||'0');}catch(e){}
  var visitCount2=0;
  try{visitCount2=parseInt(localStorage.getItem(LMS_ENGAGE_NS+'visit_count')||'0');}catch(e){}
  var daysSinceDonate=(Date.now()-lastDonateTs)/(24*60*60*1000);
  if(visitCount2>0 && visitCount2%5===0 && daysSinceDonate>=2){
    try{localStorage.setItem(LMS_ENGAGE_NS+'donate_ts',String(Date.now()));}catch(e){}
    setTimeout(function(){ engageShowDonate(); },6000);
  }
}

function engageShowReview(){
  if(document.getElementById('engage-review-overlay')) return;
  var el=document.createElement('div');
  el.id='engage-review-overlay';
  el.className='engage-overlay';
  el.innerHTML='<div class="engage-card">'
    +'<button class="engage-close" onclick="engageDismiss(\'review\')">×</button>'
    +'<h4>⭐ Enjoying the content?</h4>'
    +'<p>Your Google review helps more electricians and learners find these free study resources. It takes 30 seconds and means a lot.</p>'
    +'<div class="engage-actions">'
    +'<a href="'+GOOGLE_REVIEW_URL+'" target="_blank" rel="noopener" class="biz-btn biz-btn-primary" onclick="engageMarkReviewed()" style="text-decoration:none;">Rate us on Google</a>'
    +'<button class="biz-btn" onclick="engageDismiss(\'review\')">Maybe later</button>'
    +'</div></div>';
  document.body.appendChild(el);
}

function engageMarkReviewed(){
  try{localStorage.setItem(LMS_ENGAGE_NS+'reviewed','1');}catch(e){}
  engageDismiss('review');
}

function engageCopyText(txt,btn){
  try{navigator.clipboard.writeText(txt).then(function(){btn.textContent='Copied!';setTimeout(function(){btn.textContent='Copy';},2000);});}catch(e){btn.textContent='Copy';}
}
function engageShowDonate(){
  window.open('https://pay.yoco.com/riba-t-tseke','_blank','noopener');
}

function engageDismiss(type){
  var el=document.getElementById('engage-'+type+'-overlay');
  if(el) el.remove();
}

function engageBankApp(bank){
  // Try deep-link to banking app; falls back gracefully if app not installed
  var schemes={
    fnb:'fnbmobilebanking://',
    capitec:'capitecbankapp://',
    absa:'absabankingapp://',
    standardbank:'standardbankapp://',
    nedbank:'nedbankapp://'
  };
  var scheme=schemes[bank];
  if(scheme){
    // Copy PayShap number first so user has it ready
    try{navigator.clipboard.writeText('0724748888');}catch(e){}
    // Try to open app via scheme link; browsers may block non-registered schemes silently
    var a=document.createElement('a');
    a.href=scheme;
    a.click();
    // Show instruction toast
    var t=document.createElement('div');
    t.style.cssText='position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#222;color:#fff;padding:9px 16px;border-radius:8px;font-size:12.5px;z-index:9999;text-align:center;max-width:280px;line-height:1.5;';
    t.textContent='Number copied! Open your '+bank.charAt(0).toUpperCase()+bank.slice(1)+' app → PayShap / Instant Pay → paste 072 474 8888';
    document.body.appendChild(t);
    setTimeout(function(){if(t.parentNode)t.parentNode.removeChild(t);},4500);
  }
}

// Photo capture state for job modal
var _jmPhotos=[];

function jobRender(){
  var list=bizList('job');
  list.sort(function(a,b){return b.ts-a.ts;});
  var el=document.getElementById('job-list');
  if(!el)return;
  if(!list.length){el.innerHTML='<p style="color:var(--muted)">No job cards yet. Click <b>+ New Job Card</b> to start.</p>';return;}
  var html='<table class="biz-table"><thead><tr><th>Job #</th><th>Client</th><th>Site Address</th><th>Type</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead><tbody>';
  list.forEach(function(j){
    html+='<tr><td><b>'+j.jobNo+'</b></td><td>'+esc(j.clientName||'—')+'</td><td>'+esc(j.site||'—')+'</td><td>'+esc(j.jobType||'—')+'</td>'
      +'<td><span class="biz-badge '+(j.status==='Complete'?'biz-badge-green':j.status==='In Progress'?'biz-badge-blue':'biz-badge-teal')+'">'+esc(j.status||'Open')+'</span></td>'
      +'<td>'+(j.date||'—')+'</td>'
      +'<td><button class="biz-btn" onclick="jobEdit(\''+j.id+'\')">Edit</button> '
      +'<button class="biz-btn" onclick="jobPrint(\''+j.id+'\')">Print</button> '
      +'<button class="biz-btn biz-btn-teal" onclick="cocFromJob(\''+j.id+'\')">→CoC</button></td></tr>';
  });
  el.innerHTML=html+'</tbody></table>';
}
function jobNew(){jobEdit(null);}
function jobEdit(id){
  var j=id?bizGet('job_'+id):{};
  var clients=bizList('cl');
  if(!clients.length){
    var ov=document.createElement('div');ov.className='biz-modal-bg';
    ov.innerHTML='<div class="biz-modal"><h4>No Clients Yet</h4>'
      +'<p style="font-size:13.5px;color:var(--fg2);">Please add a client first before creating a job card.</p>'
      +'<div class="biz-modal-actions">'
      +'<button class="biz-btn biz-btn-primary" onclick="this.closest(\'.biz-modal-bg\').remove();hubShow(\'hub-clients\')">Go to Clients</button>'
      +'<button class="biz-btn" onclick="this.closest(\'.biz-modal-bg\').remove()">Cancel</button>'
      +'</div></div>';
    document.body.appendChild(ov);return;
  }
  var cOpts=clients.map(function(c){return '<option value="'+c.id+'"'+(j.clientId===c.id?' selected':'')+'>'+esc(c.name)+'</option>';}).join('');
  var html='<div class="biz-modal-bg" id="job-modal">'
    +'<div class="biz-modal">'
    +'<h3>'+(id?'Edit':'New')+' Job Card</h3>'
    +'<label>Client *<select id="jm-client"><option value="">— Select Client —</option>'+cOpts+'</select></label>'
    +'<label>Site / Work Address *<input id="jm-site" value="'+esc(j.site||'')+'"></label>'
    +'<label>Job Type<select id="jm-type">'
      +['CoC Inspection','Fault Finding','New Installation','Maintenance','Other'].map(function(t){return '<option'+(j.jobType===t?' selected':'')+'>'+t+'</option>';}).join('')
    +'</select></label>'
    +'<label>Date<input type="date" id="jm-date" value="'+(j.date||today())+'"></label>'
    +'<label>Status<select id="jm-status">'
      +['Open','In Progress','Complete','Cancelled'].map(function(s){return '<option'+(j.status===s?' selected':'')+'>'+s+'</option>';}).join('')
    +'</select></label>'
    +'<label>Assigned Technician<input id="jm-tech" value="'+esc(j.tech||'Tseke Riba')+'"></label>'
    +'<label>Description / Scope of Work<textarea id="jm-desc" rows="3">'+esc(j.desc||'')+'</textarea></label>'
    +'<label>Client PO / Reference<input id="jm-ref" value="'+esc(j.clientRef||'')+'"></label>'
    +'<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px;">'
    +'<div style="font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--fg3);margin-bottom:6px;">📷 Site Photos</div>'
    +'<div style="font-size:12px;color:var(--fg3);margin-bottom:8px;">Tap the button to open camera or choose from files. Photos are saved with this job and embed in the printed report.</div>'
    +'<button type="button" class="biz-btn biz-btn-secondary" onclick="document.getElementById(\'jm-photo-input\').click()" style="margin-bottom:8px;">📷 Add / Capture Photo</button>'
    +'<input type="file" id="jm-photo-input" accept="image/*" multiple style="display:none" onchange="jmAddPhotos(this)">'
    +'<div id="jm-photo-preview" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px;"></div>'
    +'</div>'
    +'<div class="biz-modal-actions">'
    +'<button class="biz-btn biz-btn-primary" onclick="jobSave(\''+id+'\')">Save</button> '
    +'<button class="biz-btn" onclick="closeModal(\'job-modal\')">Cancel</button>'
    +(id?'<button class="biz-btn biz-btn-danger" style="float:right" onclick="bizDel(\'job_'+id+'\');closeModal(\'job-modal\');jobRender()">Delete</button>':'')
    +'</div></div></div>';
  _jmPhotos=(j.photos||[]).slice();
  document.body.insertAdjacentHTML('beforeend',html);
  var _m=document.body.lastElementChild;if(_m&&_m.classList.contains('biz-modal-bg'))_m.scrollIntoView({behavior:'smooth',block:'nearest'});
  setTimeout(function(){ _jmPhotos.forEach(function(p,i){ jmRenderThumb(p,i); }); },0);
}
function jmAddPhotos(inp){
  var files=Array.from(inp.files);
  files.forEach(function(file){
    if(_jmPhotos.length>=10){alert('Max 10 photos per job card.');return;}
    var r=new FileReader();
    r.onload=function(e){
      var dataUrl=e.target.result;
      _jmPhotos.push({dataUrl:dataUrl,name:file.name});
      jmRenderThumb(dataUrl,_jmPhotos.length-1);
    };
    r.readAsDataURL(file);
  });
  inp.value='';
}
function jmRenderThumb(src,idx){
  var prev=document.getElementById('jm-photo-preview');if(!prev)return;
  var url=(typeof src==='object')?src.dataUrl:src;
  var wrap=document.createElement('div');
  wrap.setAttribute('data-pidx',String(idx));
  wrap.style.cssText='position:relative;width:72px;height:72px;';
  wrap.innerHTML='<img src="'+url+'" style="width:72px;height:72px;object-fit:cover;border-radius:6px;border:1px solid var(--border)">';
  var xbtn=document.createElement('button');
  xbtn.style.cssText='position:absolute;top:-5px;right:-5px;width:18px;height:18px;border-radius:50%;border:none;background:#c00;color:#fff;font-size:11px;cursor:pointer;line-height:1;padding:0';
  xbtn.textContent='\u00d7';
  xbtn.setAttribute('onclick','jmRemovePhoto('+idx+')');
  wrap.appendChild(xbtn);
  prev.appendChild(wrap);
}
function jmRemovePhoto(idx){
  _jmPhotos.splice(idx,1);
  var prev=document.getElementById('jm-photo-preview');
  if(prev){prev.innerHTML='';_jmPhotos.forEach(function(p,i){jmRenderThumb(p,i);});}
}
function jobSave(id){
  var clientId=val('jm-client');
  var site=val('jm-site').trim();
  if(!clientId){alert('Please select a client.');return;}
  if(!site){alert('Site address is required.');return;}
  var clients=bizList('cl_');
  var cli=clients.find(function(c){return c.id===clientId;})||{};
  var seq=id?null:bizSeq('job');
  var jobNo=id?(bizGet('job_'+id)||{}).jobNo:('JC-'+String(seq).padStart(4,'0'));
  var obj={clientId:clientId,clientName:cli.name||'',site:site,jobType:val('jm-type'),
    date:val('jm-date'),status:val('jm-status'),tech:val('jm-tech'),desc:val('jm-desc'),clientRef:val('jm-ref'),
    photos:_jmPhotos.slice(),
    jobNo:jobNo,ts:Date.now()};
  if(id){obj=Object.assign(bizGet('job_'+id)||{},obj);}else{obj.id=jobNo;}
  bizSet('job_'+(id||jobNo),obj);
  closeModal('job-modal');
  jobRender();
}
function jobPrint(id){
  var j=bizGet('job_'+id);if(!j)return;
  var co=getCompany();
  var w=window.open('','_blank','width=800,height=600');
  w.document.write('<!DOCTYPE html><html><head><title>Job Card '+j.jobNo+'</title>'
    +'<style>body{font-family:Arial,sans-serif;margin:40px;color:#222}h1{color:#1a237e}.hdr{display:flex;justify-content:space-between}'
    +'table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px}th{background:#eee}'
    +'.notice{background:#fff3cd;padding:8px;margin:12px 0;border-left:4px solid #f0a500}'
    +'</style></head><body>'
    +'<div class="hdr"><div><h2>'+esc(co.name||'Ribatt Electrical')+'</h2><small>'+esc(co.reg||'')+'</small></div>'
    +'<div style="text-align:right"><h1>JOB CARD</h1><b>'+j.jobNo+'</b><br>Date: '+j.date+'</div></div><hr>'
    +'<div class="notice">⚠ This company is NOT VAT registered. No VAT applicable.</div>'
    +'<table><tr><th>Client</th><td>'+esc(j.clientName)+'</td><th>Status</th><td>'+esc(j.status)+'</td></tr>'
    +'<tr><th>Site Address</th><td colspan="3">'+esc(j.site)+'</td></tr>'
    +'<tr><th>Job Type</th><td>'+esc(j.jobType)+'</td><th>Technician</th><td>'+esc(j.tech)+'</td></tr>'
    +'<tr><th>Client PO/Ref</th><td colspan="3">'+esc(j.clientRef||'—')+'</td></tr>'
    +'<tr><th>Description</th><td colspan="3" style="white-space:pre-wrap">'+esc(j.desc||'')+'</td></tr></table>'
    +'<br><table><tr><th style="width:50%">Technician Signature</th><th>Client Signature</th></tr>'
    +'<tr><td style="height:60px">___________________</td><td>___________________</td></tr>'
    +'<tr><td>Date: __________</td><td>Date: __________</td></tr></table>'
    +(j.photos&&j.photos.length?'<h3 style="margin-top:24px;color:#1a237e">Site Photos ('+j.photos.length+')</h3>'
      +'<div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:8px;">'
      +j.photos.map(function(p,i){return '<div style="text-align:center"><img src="'+(p.dataUrl||p)+'" style="max-width:200px;max-height:200px;border:1px solid #ccc;border-radius:4px"><br><small style="color:#666">Photo '+(i+1)+'</small></div>';}).join('')
      +'</div>':'')
    +'</body></html>');
  w.document.close();w.print();
}
function cocFromJob(jobId){
  var j=bizGet('job_'+jobId);if(!j)return;
  hubShow('hub-coc');
  setTimeout(function(){cocNew(j.clientId,j.site,j.jobNo);},100);
}

/* ═══════════════════════════════════════════════════════════
   PHASE 2 — CoC REGISTER
   ═══════════════════════════════════════════════════════════ */
function cocRender(){
  var list=bizList('coc');
  list.sort(function(a,b){return b.ts-a.ts;});
  var el=document.getElementById('coc-list');
  if(!el)return;
  if(!list.length){el.innerHTML='<p style="color:var(--muted)">No CoCs yet. Click <b>+ New CoC</b> to start.</p>';return;}
  var html='<table class="biz-table"><thead><tr><th>CoC #</th><th>Client</th><th>Site</th><th>Installation Type</th><th>Date</th><th>Expiry</th><th>Actions</th></tr></thead><tbody>';
  list.forEach(function(c){
    var exp=c.expiry?'<span class="biz-badge '+(isExpired(c.expiry)?'biz-badge-red':'biz-badge-green')+'">'+c.expiry+'</span>':'—';
    html+='<tr><td><b>'+c.cocNo+'</b></td><td>'+esc(c.clientName||'—')+'</td><td>'+esc(c.site||'—')+'</td><td>'+esc(c.instType||'—')+'</td>'
      +'<td>'+(c.date||'—')+'</td><td>'+exp+'</td>'
      +'<td><button class="biz-btn" onclick="cocEdit(\''+c.id+'\')">Edit</button> '
      +'<button class="biz-btn" onclick="cocPrint(\''+c.id+'\')">Print</button> '
      +'<button class="biz-btn biz-btn-teal" onclick="poeFromCoc(\''+c.id+'\')">→POE</button></td></tr>';
  });
  el.innerHTML=html+'</tbody></table>';
}
function cocNew(preClientId,preSite,preJobRef){cocEdit(null,preClientId,preSite,preJobRef);}
function cocEdit(id,preClientId,preSite,preJobRef){
  // Guard: remove any existing coc-modal first to prevent 3x rendering
  var existingModal=document.getElementById('coc-modal');
  if(existingModal) existingModal.remove();
  var c=id?bizGet('coc_'+id):{}; 
  var cliId=preClientId||c.clientId||'';
  var clients=bizList('cl_');
  var cOpts=clients.map(function(cl){return '<option value="'+cl.id+'"'+(cliId===cl.id?' selected':'')+'>'+esc(cl.name)+'</option>';}).join('');
  var html='<div class="biz-modal-bg" id="coc-modal">'
    +'<div class="biz-modal">'
    +'<h3>'+(id?'Edit':'New')+' Certificate of Compliance (CoC)</h3>'
    +'<label>Client *<select id="cm-client"><option value="">— Select —</option>'+cOpts+'</select></label>'
    +'<label>Site / Installation Address *<input id="cm-site" value="'+esc(preSite||c.site||'')+'"></label>'
    +'<label>Installation Type<select id="cm-type">'
      +['Domestic','Commercial','Industrial','Agricultural','PV System','Temporary'].map(function(t){return '<option'+(c.instType===t?' selected':'')+'>'+t+'</option>';}).join('')
    +'</select></label>'
    +'<label>Job Card Reference<input id="cm-jobref" value="'+esc(preJobRef||c.jobRef||'')+'"></label>'
    +'<label>Date of Inspection<input type="date" id="cm-date" value="'+(c.date||today())+'"></label>'
    +'<label>Expiry Date (3 years)<input type="date" id="cm-expiry" value="'+(c.expiry||threeYearsFrom(today()))+'"></label>'
    +'<label>Inspector Name<input id="cm-inspector" value="'+esc(c.inspector||'Tseke Riba')+'"></label>'
    +'<label>Inspector Registration #<input id="cm-reg" value="'+esc(c.inspReg||'')+'"></label>'
    +'<label>Findings / Notes<textarea id="cm-notes" rows="3">'+esc(c.notes||'')+'</textarea></label>'
    +'<label style="margin-top:8px;">Signed CoC PDF <span style="font-size:11px;color:var(--fg3);">(optional — stored locally)</span>'
    +'<input type="file" id="cm-pdf" accept="application/pdf" style="margin-top:4px;display:block;font-size:12px;">'
    +(c.pdfName?'<span style="font-size:11px;color:var(--amb);margin-top:2px;display:block;">Current: '+esc(c.pdfName)+'</span>':'')
    +'</label>'
    +'<label>Result<select id="cm-result">'
      +['Pass','Conditional Pass','Fail','Pending'].map(function(r){return '<option'+(c.result===r?' selected':'')+'>'+r+'</option>';}).join('')
    +'</select></label>'
    +'<div class="biz-modal-actions">'
    +'<button class="biz-btn biz-btn-primary" onclick="cocSave(\''+id+'\')">Save</button> '
    +'<button class="biz-btn" onclick="closeModal(\'coc-modal\')">Cancel</button>'
    +(id?'<button class="biz-btn biz-btn-danger" style="float:right" onclick="bizDel(\'coc_'+id+'\');closeModal(\'coc-modal\');cocRender()">Delete</button>':'')
    +'</div></div></div>';
  document.body.insertAdjacentHTML('beforeend',html);
  var _m=document.body.lastElementChild;if(_m&&_m.classList.contains('biz-modal-bg'))_m.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function cocSave(id){
  var clientId=val('cm-client');
  var site=val('cm-site').trim();
  if(!clientId){alert('Please select a client.');return;}
  if(!site){alert('Site address is required.');return;}
  var clients=bizList('cl_');
  var cli=clients.find(function(c){return c.id===clientId;})||{};
  var seq=id?null:bizSeq('coc');
  var cocNo=id?(bizGet('coc_'+id)||{}).cocNo:('COC-'+String(seq).padStart(4,'0'));
  var obj={clientId:clientId,clientName:cli.name||'',site:site,instType:val('cm-type'),
    jobRef:val('cm-jobref'),date:val('cm-date'),expiry:val('cm-expiry'),
    inspector:val('cm-inspector'),inspReg:val('cm-reg'),notes:val('cm-notes'),result:val('cm-result'),
    cocNo:cocNo,ts:Date.now()};
  if(id){obj=Object.assign(bizGet('coc_'+id)||{},obj);}else{obj.id=cocNo;}
  // Handle optional PDF upload — read as base64 and store with record
  var pdfInp=document.getElementById('cm-pdf');
  if(pdfInp&&pdfInp.files&&pdfInp.files[0]){
    var file=pdfInp.files[0];
    var reader=new FileReader();
    reader.onload=function(ev){
      obj.pdfData=ev.target.result; // base64 data URI
      obj.pdfName=file.name;
      obj.pdfSize=file.size;
      bizSet('coc_'+(id||cocNo),obj);
      closeModal('coc-modal');
      cocRender();
    };
    reader.readAsDataURL(file);
  } else {
    bizSet('coc_'+(id||cocNo),obj);
    closeModal('coc-modal');
    cocRender();
  }
}
function cocPrint(id){
  var c=bizGet('coc_'+id);if(!c)return;
  var co=getCompany();
  var w=window.open('','_blank','width=800,height=600');
  w.document.write('<!DOCTYPE html><html><head><title>CoC '+c.cocNo+'</title>'
    +'<style>body{font-family:Arial,sans-serif;margin:40px;color:#222}h1{color:#1a237e}.hdr{display:flex;justify-content:space-between}'
    +'table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px}th{background:#eee}'
    +'.result-pass{color:green;font-weight:bold}.result-fail{color:red;font-weight:bold}'
    +'.notice{background:#fff3cd;padding:8px;margin:12px 0;border-left:4px solid #f0a500}'
    +'</style></head><body>'
    +'<div class="hdr"><div><h2>'+esc(co.name||'Ribatt Electrical')+'</h2><small>'+esc(co.reg||'')+'</small></div>'
    +'<div style="text-align:right"><h1>CERTIFICATE OF COMPLIANCE</h1><b>'+c.cocNo+'</b></div></div><hr>'
    +'<div class="notice">⚠ This company is NOT VAT registered. No VAT applicable.</div>'
    +'<table>'
    +'<tr><th>Client</th><td>'+esc(c.clientName)+'</td><th>Date</th><td>'+c.date+'</td></tr>'
    +'<tr><th>Site Address</th><td colspan="3">'+esc(c.site)+'</td></tr>'
    +'<tr><th>Installation Type</th><td>'+esc(c.instType)+'</td><th>Job Ref</th><td>'+esc(c.jobRef||'—')+'</td></tr>'
    +'<tr><th>Inspector</th><td>'+esc(c.inspector)+'</td><th>Registration #</th><td>'+esc(c.inspReg||'—')+'</td></tr>'
    +'<tr><th>Expiry Date</th><td>'+esc(c.expiry||'—')+'</td><th>Result</th><td class="'+(c.result==='Pass'?'result-pass':'result-fail')+'">'+esc(c.result)+'</td></tr>'
    +'<tr><th>Notes / Findings</th><td colspan="3" style="white-space:pre-wrap">'+esc(c.notes||'—')+'</td></tr></table>'
    +'<br><p>I, the undersigned, hereby certify that the electrical installation described above has been inspected and tested in accordance with SANS 10142-1 and the Occupational Health and Safety Act.</p>'
    +'<br><table><tr><th>Inspector Signature</th><th>Client Signature</th></tr>'
    +'<tr><td style="height:60px">___________________</td><td>___________________</td></tr>'
    +'<tr><td>Date: __________</td><td>Date: __________</td></tr></table>'
    +'<p style="font-size:11px;color:#666">Valid for 3 years from date of issue. Issued under SANS 10142-1.</p>'
    +'</body></html>');
  w.document.close();w.print();
}
function poeFromCoc(cocId){
  var c=bizGet('coc_'+cocId);if(!c)return;
  hubShow('hub-poe');
  setTimeout(function(){poeNew(c.clientId,c.cocNo,c.site);},100);
}
function isExpired(dateStr){
  if(!dateStr)return false;
  return new Date(dateStr)<new Date();
}
function threeYearsFrom(d){
  var dt=new Date(d);dt.setFullYear(dt.getFullYear()+3);return dt.toISOString().slice(0,10);
}


/* ═══════════════════════════════════════════════════════════
   PHASE 2 — PORTFOLIO OF EVIDENCE
   ═══════════════════════════════════════════════════════════ */
var POE_CHECKLIST=[
  'Earthing and bonding verified per SANS 10142-1',
  'Circuit breaker ratings checked and correct',
  'RCD / RCCB tested and functional',
  'Polarity of all socket outlets verified',
  'Insulation resistance test passed (>1 MΩ)',
  'Continuity of protective conductors verified',
  'No live parts accessible (IP2X minimum)',
  'Main distribution board labelled and secured',
  'All wiring correctly routed and secured',
  'As-built drawings / schematic provided to client'
];
function poeRender(){
  var list=bizList('poe');
  list.sort(function(a,b){return b.ts-a.ts;});
  var el=document.getElementById('poe-list');
  if(!el)return;
  if(!list.length){el.innerHTML='<p style="color:var(--muted)">No POE records yet. Click <b>+ New POE</b> to start.</p>';return;}
  var html='<table class="biz-table"><thead><tr><th>POE #</th><th>Client</th><th>Site</th><th>CoC Ref</th><th>Date</th><th>Score</th><th>Actions</th></tr></thead><tbody>';
  list.forEach(function(p){
    var score=p.checks?p.checks.filter(Boolean).length+'/'+p.checks.length:'—';
    html+='<tr><td><b>'+p.poeNo+'</b></td><td>'+esc(p.clientName||'—')+'</td><td>'+esc(p.site||'—')+'</td><td>'+esc(p.cocRef||'—')+'</td>'
      +'<td>'+(p.date||'—')+'</td><td>'+score+'</td>'
      +'<td><button class="biz-btn" onclick="poeEdit(\''+p.id+'\')">Edit</button> '
      +'<button class="biz-btn" onclick="poePrint(\''+p.id+'\')">Print</button></td></tr>';
  });
  el.innerHTML=html+'</tbody></table>';
}
function poeNew(preClientId,preCocRef,preSite){poeEdit(null,preClientId,preCocRef,preSite);}
function poeEdit(id,preClientId,preCocRef,preSite){
  var p=id?bizGet('poe_'+id):{};
  var cliId=preClientId||p.clientId||'';
  var clients=bizList('cl_');
  var cOpts=clients.map(function(c){return '<option value="'+c.id+'"'+(cliId===c.id?' selected':'')+'>'+esc(c.name)+'</option>';}).join('');
  var checks=p.checks||POE_CHECKLIST.map(function(){return false;});
  var checkHtml=POE_CHECKLIST.map(function(item,i){
    return '<label style="display:flex;gap:8px;align-items:center;margin:4px 0"><input type="checkbox" id="poe-chk-'+i+'" '+(checks[i]?'checked':'')+'>'+esc(item)+'</label>';
  }).join('');
  var html='<div class="biz-modal-bg" id="poe-modal">'
    +'<div class="biz-modal" style="max-width:600px">'
    +'<h3>'+(id?'Edit':'New')+' Portfolio of Evidence</h3>'
    +'<label>Client *<select id="pm-client"><option value="">— Select —</option>'+cOpts+'</select></label>'
    +'<label>Site Address<input id="pm-site" value="'+esc(preSite||p.site||'')+'"></label>'
    +'<label>CoC Reference<input id="pm-cocref" value="'+esc(preCocRef||p.cocRef||'')+'"></label>'
    +'<label>Date<input type="date" id="pm-date" value="'+(p.date||today())+'"></label>'
    +'<label>Inspector<input id="pm-inspector" value="'+esc(p.inspector||'Tseke Riba')+'"></label>'
    +'<fieldset style="margin:12px 0;padding:12px"><legend><b>Inspection Checklist</b></legend>'+checkHtml+'</fieldset>'
    +'<label>Additional Findings / Comments<textarea id="pm-notes" rows="3">'+esc(p.notes||'')+'</textarea></label>'
    +'<label>ECSA Outcome Supported<select id="pm-ecsa">'
      +['None','1 - Problem Solving','2 - Scientific Knowledge','3 - Engineering Design','4 - Investigations','5 - Methods/Tools/IT','6 - Communication','7 - Sustainability','8 - Team Working','9 - Independent Learning','10 - Professionalism','11 - Management'].map(function(o){return '<option'+(p.ecsaOutcome===o?' selected':'')+'>'+o+'</option>';}).join('')
    +'</select></label>'
    +'<div class="biz-modal-actions">'
    +'<button class="biz-btn biz-btn-primary" onclick="poeSave(\''+id+'\')">Save</button> '
    +'<button class="biz-btn" onclick="closeModal(\'poe-modal\')">Cancel</button>'
    +(id?'<button class="biz-btn biz-btn-danger" style="float:right" onclick="bizDel(\'poe_'+id+'\');closeModal(\'poe-modal\');poeRender()">Delete</button>':'')
    +'</div></div></div>';
  document.body.insertAdjacentHTML('beforeend',html);
  var _m=document.body.lastElementChild;if(_m&&_m.classList.contains('biz-modal-bg'))_m.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function poeSave(id){
  var clientId=val('pm-client');
  if(!clientId){alert('Please select a client.');return;}
  var clients=bizList('cl_');
  var cli=clients.find(function(c){return c.id===clientId;})||{};
  var checks=POE_CHECKLIST.map(function(_,i){return document.getElementById('poe-chk-'+i)?document.getElementById('poe-chk-'+i).checked:false;});
  var seq=id?null:bizSeq('poe');
  var poeNo=id?(bizGet('poe_'+id)||{}).poeNo:('POE-'+String(seq).padStart(4,'0'));
  var obj={clientId:clientId,clientName:cli.name||'',site:val('pm-site'),cocRef:val('pm-cocref'),
    date:val('pm-date'),inspector:val('pm-inspector'),checks:checks,notes:val('pm-notes'),
    ecsaOutcome:val('pm-ecsa'),poeNo:poeNo,ts:Date.now()};
  if(id){obj=Object.assign(bizGet('poe_'+id)||{},obj);}else{obj.id=poeNo;}
  bizSet('poe_'+(id||poeNo),obj);
  closeModal('poe-modal');
  poeRender();
}
function poePrint(id){
  var p=bizGet('poe_'+id);if(!p)return;
  var co=getCompany();
  var checkRows=POE_CHECKLIST.map(function(item,i){
    var ok=p.checks&&p.checks[i];
    return '<tr><td>'+(i+1)+'</td><td>'+esc(item)+'</td><td style="color:'+(ok?'green':'red')+';font-weight:bold">'+(ok?'✓ PASS':'✗ FAIL')+'</td></tr>';
  }).join('');
  var w=window.open('','_blank','width=800,height=700');
  w.document.write('<!DOCTYPE html><html><head><title>POE '+p.poeNo+'</title>'
    +'<style>body{font-family:Arial,sans-serif;margin:40px;color:#222}h1{color:#1a237e}'
    +'.hdr{display:flex;justify-content:space-between}table{width:100%;border-collapse:collapse}'
    +'td,th{border:1px solid #ccc;padding:8px}th{background:#eee}'
    +'.notice{background:#fff3cd;padding:8px;margin:12px 0;border-left:4px solid #f0a500}'
    +'</style></head><body>'
    +'<div class="hdr"><div><h2>'+esc(co.name||'Ribatt Electrical')+'</h2></div>'
    +'<div style="text-align:right"><h1>PORTFOLIO OF EVIDENCE</h1><b>'+p.poeNo+'</b></div></div><hr>'
    +'<div class="notice">⚠ This company is NOT VAT registered. No VAT applicable.</div>'
    +'<table><tr><th>Client</th><td>'+esc(p.clientName)+'</td><th>Date</th><td>'+p.date+'</td></tr>'
    +'<tr><th>Site</th><td colspan="3">'+esc(p.site||'—')+'</td></tr>'
    +'<tr><th>CoC Reference</th><td>'+esc(p.cocRef||'—')+'</td><th>Inspector</th><td>'+esc(p.inspector||'—')+'</td></tr>'
    +'<tr><th>ECSA Outcome</th><td colspan="3">'+esc(p.ecsaOutcome||'None')+'</td></tr></table>'
    +'<h3>Inspection Checklist</h3>'
    +'<table><thead><tr><th>#</th><th>Item</th><th>Result</th></tr></thead><tbody>'+checkRows+'</tbody></table>'
    +'<h3>Additional Notes</h3><p style="white-space:pre-wrap">'+esc(p.notes||'—')+'</p>'
    +'<br><table><tr><th>Inspector Signature</th><th>Client Signature</th></tr>'
    +'<tr><td style="height:60px">___________________</td><td>___________________</td></tr></table>'
    +'</body></html>');
  w.document.close();w.print();
}

/* ═══════════════════════════════════════════════════════════
   PHASE 3 — PROJECTS
   ═══════════════════════════════════════════════════════════ */
function projRender(){
  var list=bizList('proj');
  list.sort(function(a,b){return b.ts-a.ts;});
  var el=document.getElementById('proj-list');
  if(!el)return;
  if(!list.length){el.innerHTML='<p style="color:var(--muted)">No projects yet. Click <b>+ New Project</b> to start.</p>';return;}
  var html='<table class="biz-table"><thead><tr><th>Proj #</th><th>Name</th><th>Client</th><th>Value (R)</th><th>Start</th><th>End</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
  list.forEach(function(p){
    var miles=bizList('mile').filter(function(m){return m.projId===p.id;});
    var done=miles.filter(function(m){return m.done;}).length;
    html+='<tr><td><b>'+p.projNo+'</b></td><td>'+esc(p.name||'—')+'</td><td>'+esc(p.clientName||'—')+'</td>'
      +'<td>'+fmt(p.value||0)+'</td><td>'+(p.startDate||'—')+'</td><td>'+(p.endDate||'—')+'</td>'
      +'<td><span class="biz-badge '+(p.status==='Complete'?'biz-badge-green':p.status==='Active'?'biz-badge-blue':'biz-badge-teal')+'">'+esc(p.status||'Planning')+'</span></td>'
      +'<td><button class="biz-btn" onclick="projEdit(\''+p.id+'\')">Edit</button> '
      +'<button class="biz-btn" onclick="mileModal(\''+p.id+'\')">Milestones ('+(done+'/'+miles.length)+')</button> '
      +'<button class="biz-btn" onclick="projPrint(\''+p.id+'\')">Print</button></td></tr>';
  });
  el.innerHTML=html+'</tbody></table>';
}
function projNew(){projEdit(null);}
function projEdit(id){
  var p=id?bizGet('proj_'+id):{};
  var clients=bizList('cl_');
  var cOpts=clients.map(function(c){return '<option value="'+c.id+'"'+(p.clientId===c.id?' selected':'')+'>'+esc(c.name)+'</option>';}).join('');
  var html='<div class="biz-modal-bg" id="proj-modal">'
    +'<div class="biz-modal" style="max-width:580px">'
    +'<h3>'+(id?'Edit':'New')+' Project</h3>'
    +'<label>Project Name *<input id="pjm-name" value="'+esc(p.name||'')+'"></label>'
    +'<label>Client<select id="pjm-client"><option value="">— Select —</option>'+cOpts+'</select></label>'
    +'<label>Project Value (R)<input type="number" id="pjm-value" value="'+(p.value||0)+'" min="0"></label>'
    +'<label>Start Date<input type="date" id="pjm-start" value="'+(p.startDate||today())+'"></label>'
    +'<label>End Date<input type="date" id="pjm-end" value="'+(p.endDate||'')+'"></label>'
    +'<label>Status<select id="pjm-status">'
      +['Planning','Active','On Hold','Complete','Cancelled'].map(function(s){return '<option'+(p.status===s?' selected':'')+'>'+s+'</option>';}).join('')
    +'</select></label>'
    +'<label>Description / Scope<textarea id="pjm-desc" rows="3">'+esc(p.desc||'')+'</textarea></label>'
    +'<label>ECSA Outcomes Covered<input id="pjm-ecsa" value="'+esc(p.ecsaOutcomes||'')+'"><small>e.g. 1,3,5</small></label>'
    +'<div class="biz-modal-actions">'
    +'<button class="biz-btn biz-btn-primary" onclick="projSave(\''+id+'\')">Save</button> '
    +'<button class="biz-btn" onclick="closeModal(\'proj-modal\')">Cancel</button>'
    +(id?'<button class="biz-btn biz-btn-danger" style="float:right" onclick="bizDel(\'proj_'+id+'\');closeModal(\'proj-modal\');projRender()">Delete</button>':'')
    +'</div></div></div>';
  document.body.insertAdjacentHTML('beforeend',html);
  var _m=document.body.lastElementChild;if(_m&&_m.classList.contains('biz-modal-bg'))_m.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function projSave(id){
  var name=val('pjm-name').trim();
  if(!name){alert('Project name is required.');return;}
  var clientId=val('pjm-client');
  var clients=bizList('cl_');
  var cli=clients.find(function(c){return c.id===clientId;})||{};
  var seq=id?null:bizSeq('proj');
  var projNo=id?(bizGet('proj_'+id)||{}).projNo:('PRJ-'+String(seq).padStart(3,'0'));
  var obj={name:name,clientId:clientId,clientName:cli.name||'',value:parseFloat(val('pjm-value'))||0,
    startDate:val('pjm-start'),endDate:val('pjm-end'),status:val('pjm-status'),desc:val('pjm-desc'),
    ecsaOutcomes:val('pjm-ecsa'),projNo:projNo,ts:Date.now()};
  if(id){obj=Object.assign(bizGet('proj_'+id)||{},obj);}else{obj.id=projNo;}
  bizSet('proj_'+(id||projNo),obj);
  closeModal('proj-modal');
  projRender();
}
function projPrint(id){
  var p=bizGet('proj_'+id);if(!p)return;
  var co=getCompany();
  var miles=bizList('mile').filter(function(m){return m.projId===id;});
  var mileRows=miles.map(function(m){
    return '<tr><td>'+esc(m.title)+'</td><td>'+(m.due||'—')+'</td><td style="color:'+(m.done?'green':'#888')+'">'+(m.done?'✓ Done':'Pending')+'</td></tr>';
  }).join('');
  var w=window.open('','_blank','width=800,height=700');
  w.document.write('<!DOCTYPE html><html><head><title>Project '+p.projNo+'</title>'
    +'<style>body{font-family:Arial,sans-serif;margin:40px;color:#222}h1{color:#1a237e}'
    +'.hdr{display:flex;justify-content:space-between}table{width:100%;border-collapse:collapse}'
    +'td,th{border:1px solid #ccc;padding:8px}th{background:#eee}'
    +'</style></head><body>'
    +'<div class="hdr"><div><h2>'+esc(co.name||'Ribatt Electrical')+'</h2></div>'
    +'<div style="text-align:right"><h1>PROJECT CHARTER</h1><b>'+p.projNo+'</b></div></div><hr>'
    +'<table><tr><th>Project Name</th><td colspan="3">'+esc(p.name)+'</td></tr>'
    +'<tr><th>Client</th><td>'+esc(p.clientName||'—')+'</td><th>Value</th><td>R '+fmt(p.value||0)+'</td></tr>'
    +'<tr><th>Start Date</th><td>'+esc(p.startDate||'—')+'</td><th>End Date</th><td>'+esc(p.endDate||'—')+'</td></tr>'
    +'<tr><th>Status</th><td>'+esc(p.status||'—')+'</td><th>ECSA Outcomes</th><td>'+esc(p.ecsaOutcomes||'—')+'</td></tr>'
    +'<tr><th>Description</th><td colspan="3" style="white-space:pre-wrap">'+esc(p.desc||'—')+'</td></tr></table>'
    +(miles.length?'<h3>Milestones</h3><table><thead><tr><th>Milestone</th><th>Due Date</th><th>Status</th></tr></thead><tbody>'+mileRows+'</tbody></table>':'')
    +'</body></html>');
  w.document.close();w.print();
}
function mileModal(projId){
  var p=bizGet('proj_'+projId)||{};
  var miles=bizList('mile').filter(function(m){return m.projId===projId;});
  var rows=miles.map(function(m){
    return '<tr><td>'+esc(m.title)+'</td><td>'+(m.due||'—')+'</td>'
      +'<td><input type="checkbox" '+(m.done?'checked':'')+' onchange="mileToggle(\''+m.id+'\',\''+projId+'\',this.checked)"></td>'
      +'<td><button class="biz-btn biz-btn-xs" onclick="bizDel(\'mile_'+m.id+'\');mileModal(\''+projId+'\')">✕</button></td></tr>';
  }).join('');
  var html='<div class="biz-modal-bg" id="mile-modal">'
    +'<div class="biz-modal" style="max-width:520px">'
    +'<h3>Milestones — '+esc(p.projNo||projId)+': '+esc(p.name||'')+'</h3>'
    +'<table class="biz-table"><thead><tr><th>Milestone</th><th>Due</th><th>Done</th><th></th></tr></thead><tbody>'
    +(rows||'<tr><td colspan="4" style="color:var(--muted)">No milestones yet.</td></tr>')+'</tbody></table>'
    +'<div style="margin-top:12px;display:flex;gap:8px">'
    +'<input id="mile-title" placeholder="Milestone title" style="flex:1">'
    +'<input type="date" id="mile-due" style="width:140px">'
    +'<button class="biz-btn biz-btn-primary" onclick="mileAdd(\''+projId+'\')">Add</button>'
    +'</div>'
    +'<div class="biz-modal-actions"><button class="biz-btn" onclick="closeModal(\'mile-modal\');projRender()">Close</button></div>'
    +'</div></div>';
  var old=document.getElementById('mile-modal');if(old)old.remove();
  document.body.insertAdjacentHTML('beforeend',html);
  var _m=document.body.lastElementChild;if(_m&&_m.classList.contains('biz-modal-bg'))_m.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function mileAdd(projId){
  var title=val('mile-title').trim();
  if(!title)return;
  var id='M'+Date.now();
  bizSet('mile_'+id,{id:id,projId:projId,title:title,due:val('mile-due'),done:false,ts:Date.now()});
  mileModal(projId);
}
function mileToggle(id,projId,done){
  var m=bizGet('mile_'+id)||{};m.done=done;bizSet('mile_'+id,m);
}


/* ═══════════════════════════════════════════════════════════
   PHASE 4 — HEALTH & SAFETY
   ═══════════════════════════════════════════════════════════ */
function hsShow(id){
  document.querySelectorAll('.hs-sub').forEach(function(el){el.classList.remove('active');});
  var t=document.getElementById(id);if(t)t.classList.add('active');
  document.querySelectorAll('.hub-hs-tab').forEach(function(b){b.classList.toggle('active',b.dataset.target===id);});
  if(id==='hs-risk')riskRender();
  else if(id==='hs-ms')msRender();
  else if(id==='hs-ptw')ptwRender();
  else if(id==='hs-inc')incRender();
}

/* — Risk Assessments — */
var RISK_HAZARDS=['Electrical shock','Arc flash / arc blast','Working at heights','Falling objects','Slippery surfaces',
  'Fire','Chemical exposure','Confined spaces','Manual handling','Heat stress','UV exposure (outdoor PV)',
  'Moving machinery','Tripping hazard','Inadequate lighting'];
var RISK_LIKELIHOOD=['Rare (1)','Unlikely (2)','Possible (3)','Likely (4)','Almost Certain (5)'];
var RISK_SEVERITY=['Negligible (1)','Minor (2)','Moderate (3)','Major (4)','Catastrophic (5)'];

function riskRender(){
  var list=bizList('risk');list.sort(function(a,b){return b.ts-a.ts;});
  var el=document.getElementById('risk-list');if(!el)return;
  if(!list.length){el.innerHTML='<p style="color:var(--muted)">No risk assessments yet.</p>';return;}
  var html='<table class="biz-table"><thead><tr><th>RA #</th><th>Title</th><th>Site</th><th>Date</th><th>Rating</th><th>Actions</th></tr></thead><tbody>';
  list.forEach(function(r){
    var rating=r.rating||'—';
    var rc=parseInt(rating)>=15?'biz-badge-red':parseInt(rating)>=9?'biz-badge-orange':'biz-badge-green';
    html+='<tr><td><b>'+r.raNo+'</b></td><td>'+esc(r.title||'—')+'</td><td>'+esc(r.site||'—')+'</td><td>'+(r.date||'—')+'</td>'
      +'<td><span class="biz-badge '+rc+'">'+rating+'</span></td>'
      +'<td><button class="biz-btn" onclick="riskEdit(\''+r.id+'\')">Edit</button> '
      +'<button class="biz-btn" onclick="riskPrint(\''+r.id+'\')">Print</button></td></tr>';
  });
  el.innerHTML=html+'</tbody></table>';
}
function riskNew(){
  var seq=bizSeq('risk');
  var raNo='RA-'+String(seq).padStart(4,'0');
  var id=raNo;
  bizSet('risk_'+id,{id:id,raNo:raNo,title:'',site:'',date:today(),rows:[],rating:0,ts:Date.now()});
  riskEdit(id);
}
function riskEdit(id){
  var r=bizGet('risk_'+id)||{id:id,raNo:id,rows:[]};
  var rows=r.rows||[];
  var rowsHtml=rows.map(function(row,i){
    return '<tr><td>'+esc(row.hazard)+'</td><td>'+esc(row.control)+'</td><td>'+row.L+'</td><td>'+row.S+'</td><td>'+(row.L*row.S)+'</td>'
      +'<td><button class="biz-btn biz-btn-xs" onclick="riskRemoveRow(\''+id+'\','+i+')">✕</button></td></tr>';
  }).join('');
  var hazOpts=RISK_HAZARDS.map(function(h){return '<option>'+h+'</option>';}).join('');
  var html='<div class="biz-modal-bg" id="risk-modal">'
    +'<div class="biz-modal" style="max-width:700px">'
    +'<h3>Risk Assessment — '+r.raNo+'</h3>'
    +'<label>Title / Activity<input id="rim-title" value="'+esc(r.title||'')+'"></label>'
    +'<label>Site<input id="rim-site" value="'+esc(r.site||'')+'"></label>'
    +'<label>Date<input type="date" id="rim-date" value="'+(r.date||today())+'"></label>'
    +'<h4 style="margin:12px 0 4px">Hazards &amp; Controls</h4>'
    +'<table class="biz-table" id="risk-rows-tbl"><thead><tr><th>Hazard</th><th>Control Measure</th><th>L(1-5)</th><th>S(1-5)</th><th>RPN</th><th></th></tr></thead><tbody id="risk-rows">'+rowsHtml+'</tbody></table>'
    +'<div style="display:flex;gap:6px;margin:8px 0;flex-wrap:wrap">'
    +'<select id="rim-haz" style="flex:1;min-width:160px">'+hazOpts+'</select>'
    +'<input id="rim-ctrl" placeholder="Control measure" style="flex:2;min-width:140px">'
    +'<input type="number" id="rim-L" min="1" max="5" value="1" style="width:50px" title="Likelihood">'
    +'<input type="number" id="rim-S" min="1" max="5" value="1" style="width:50px" title="Severity">'
    +'<button class="biz-btn biz-btn-primary" onclick="riskAddRow(\''+id+'\')">Add Hazard</button>'
    +'</div>'
    +'<div class="biz-modal-actions">'
    +'<button class="biz-btn biz-btn-primary" onclick="riskSave(\''+id+'\')">Save</button> '
    +'<button class="biz-btn" onclick="closeModal(\'risk-modal\');riskRender()">Cancel</button>'
    +'<button class="biz-btn biz-btn-danger" style="float:right" onclick="bizDel(\'risk_'+id+'\');closeModal(\'risk-modal\');riskRender()">Delete</button>'
    +'</div></div></div>';
  var old=document.getElementById('risk-modal');if(old)old.remove();
  document.body.insertAdjacentHTML('beforeend',html);
  var _m=document.body.lastElementChild;if(_m&&_m.classList.contains('biz-modal-bg'))_m.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function riskAddRow(id){
  var r=bizGet('risk_'+id)||{rows:[]};
  if(!r.rows)r.rows=[];
  var L=parseInt(document.getElementById('rim-L').value)||1;
  var S=parseInt(document.getElementById('rim-S').value)||1;
  r.rows.push({hazard:val('rim-haz'),control:val('rim-ctrl'),L:L,S:S});
  bizSet('risk_'+id,r);
  riskEdit(id);
}
function riskRemoveRow(id,idx){
  var r=bizGet('risk_'+id)||{rows:[]};
  r.rows.splice(idx,1);bizSet('risk_'+id,r);riskEdit(id);
}
function riskSave(id){
  var r=bizGet('risk_'+id)||{};
  r.title=val('rim-title');r.site=val('rim-site');r.date=val('rim-date');
  r.rating=Math.max.apply(null,(r.rows||[]).map(function(x){return x.L*x.S;}).concat([0]));
  r.ts=Date.now();
  bizSet('risk_'+id,r);
  closeModal('risk-modal');riskRender();
}
function riskPrint(id){
  var r=bizGet('risk_'+id);if(!r)return;
  var co=getCompany();
  var rows=(r.rows||[]).map(function(row){
    var rpn=row.L*row.S;
    var color=rpn>=15?'#c62828':rpn>=9?'#e65100':'#2e7d32';
    return '<tr><td>'+esc(row.hazard)+'</td><td>'+esc(row.control)+'</td><td style="text-align:center">'+row.L+'</td><td style="text-align:center">'+row.S+'</td>'
      +'<td style="text-align:center;color:'+color+';font-weight:bold">'+rpn+'</td></tr>';
  }).join('');
  var w=window.open('','_blank','width=900,height=700');
  w.document.write('<!DOCTYPE html><html><head><title>RA '+r.raNo+'</title>'
    +'<style>body{font-family:Arial,sans-serif;margin:40px;color:#222}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:7px}th{background:#eee}</style></head><body>'
    +'<h2>'+esc(co.name||'Ribatt Electrical')+'</h2><h1>RISK ASSESSMENT — '+r.raNo+'</h1>'
    +'<table><tr><th>Title</th><td>'+esc(r.title||'—')+'</td><th>Site</th><td>'+esc(r.site||'—')+'</td><th>Date</th><td>'+r.date+'</td></tr></table>'
    +'<h3>Hazard Register</h3>'
    +'<table><thead><tr><th>Hazard</th><th>Control Measure</th><th>L</th><th>S</th><th>RPN</th></tr></thead><tbody>'+rows+'</tbody></table>'
    +'<p style="margin-top:16px"><b>Overall Risk Rating: '+r.rating+'</b> '+(r.rating>=15?'<span style="color:red">HIGH RISK</span>':r.rating>=9?'<span style="color:orange">MEDIUM RISK</span>':'<span style="color:green">LOW RISK</span>')+'</p>'
    +'<p style="font-size:11px">L=Likelihood(1-5), S=Severity(1-5), RPN=L×S. High≥15, Medium≥9, Low&lt;9</p>'
    +'<br><table><tr><th style="width:50%">Assessor Signature</th><th>Reviewer Signature</th></tr><tr><td style="height:50px">___________________</td><td>___________________</td></tr></table>'
    +'</body></html>');
  w.document.close();w.print();
}

/* — Method Statements — */
function msRender(){
  var list=bizList('ms');list.sort(function(a,b){return b.ts-a.ts;});
  var el=document.getElementById('ms-list');if(!el)return;
  if(!list.length){el.innerHTML='<p style="color:var(--muted)">No method statements yet.</p>';return;}
  var html='<table class="biz-table"><thead><tr><th>MS #</th><th>Activity</th><th>Site</th><th>Date</th><th>Actions</th></tr></thead><tbody>';
  list.forEach(function(m){
    html+='<tr><td><b>'+m.msNo+'</b></td><td>'+esc(m.activity||'—')+'</td><td>'+esc(m.site||'—')+'</td><td>'+(m.date||'—')+'</td>'
      +'<td><button class="biz-btn" onclick="msEdit(\''+m.id+'\')">Edit</button> '
      +'<button class="biz-btn" onclick="msPrint(\''+m.id+'\')">Print</button></td></tr>';
  });
  el.innerHTML=html+'</tbody></table>';
}
function msNew(){
  var seq=bizSeq('ms');var msNo='MS-'+String(seq).padStart(4,'0');
  var obj={id:msNo,msNo:msNo,activity:'',site:'',date:today(),steps:'',ppe:'',ts:Date.now()};
  bizSet('ms_'+msNo,obj);msEdit(msNo);
}
function msEdit(id){
  var m=bizGet('ms_'+id)||{};
  var html='<div class="biz-modal-bg" id="ms-modal">'
    +'<div class="biz-modal" style="max-width:580px">'
    +'<h3>Method Statement — '+m.msNo+'</h3>'
    +'<label>Activity *<input id="mm-act" value="'+esc(m.activity||'')+'"></label>'
    +'<label>Site<input id="mm-site" value="'+esc(m.site||'')+'"></label>'
    +'<label>Date<input type="date" id="mm-date" value="'+(m.date||today())+'"></label>'
    +'<label>PPE Required<input id="mm-ppe" value="'+esc(m.ppe||'Hard hat, safety boots, gloves, hi-vis vest, safety glasses')+'"></label>'
    +'<label>Method / Procedure Steps<textarea id="mm-steps" rows="6" placeholder="1. Isolate supply and lock out / tag out&#10;2. Verify isolation with test instrument&#10;3. ...">'+esc(m.steps||'')+'</textarea></label>'
    +'<label>Emergency Procedure<textarea id="mm-emerg" rows="2">'+esc(m.emerg||'')+'</textarea></label>'
    +'<div class="biz-modal-actions">'
    +'<button class="biz-btn biz-btn-primary" onclick="msSave(\''+id+'\')">Save</button> '
    +'<button class="biz-btn" onclick="closeModal(\'ms-modal\');msRender()">Cancel</button>'
    +'<button class="biz-btn biz-btn-danger" style="float:right" onclick="bizDel(\'ms_'+id+'\');closeModal(\'ms-modal\');msRender()">Delete</button>'
    +'</div></div></div>';
  var old=document.getElementById('ms-modal');if(old)old.remove();
  document.body.insertAdjacentHTML('beforeend',html);
  var _m=document.body.lastElementChild;if(_m&&_m.classList.contains('biz-modal-bg'))_m.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function msSave(id){
  var m=bizGet('ms_'+id)||{};
  m.activity=val('mm-act');m.site=val('mm-site');m.date=val('mm-date');
  m.ppe=val('mm-ppe');m.steps=val('mm-steps');m.emerg=val('mm-emerg');m.ts=Date.now();
  bizSet('ms_'+id,m);closeModal('ms-modal');msRender();
}
function msPrint(id){
  var m=bizGet('ms_'+id);if(!m)return;
  var co=getCompany();
  var w=window.open('','_blank','width=800,height=700');
  w.document.write('<!DOCTYPE html><html><head><title>MS '+m.msNo+'</title>'
    +'<style>body{font-family:Arial,sans-serif;margin:40px;color:#222}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px}th{background:#eee}'
    +'pre{white-space:pre-wrap;font-family:Arial,sans-serif}</style></head><body>'
    +'<h2>'+esc(co.name||'Ribatt Electrical')+'</h2><h1>METHOD STATEMENT — '+m.msNo+'</h1>'
    +'<table><tr><th>Activity</th><td colspan="3">'+esc(m.activity||'—')+'</td></tr>'
    +'<tr><th>Site</th><td>'+esc(m.site||'—')+'</td><th>Date</th><td>'+m.date+'</td></tr>'
    +'<tr><th>PPE Required</th><td colspan="3">'+esc(m.ppe||'—')+'</td></tr></table>'
    +'<h3>Procedure</h3><pre>'+esc(m.steps||'—')+'</pre>'
    +'<h3>Emergency Procedure</h3><pre>'+esc(m.emerg||'Call emergency services: 10111 / 10177')+'</pre>'
    +'<br><table><tr><th style="width:50%">Responsible Person</th><th>Reviewed By</th></tr>'
    +'<tr><td style="height:50px">___________________<br>Date: __________</td><td>___________________<br>Date: __________</td></tr></table>'
    +'</body></html>');
  w.document.close();w.print();
}

/* — Permits to Work — */
function ptwRender(){
  var list=bizList('ptw');list.sort(function(a,b){return b.ts-a.ts;});
  var el=document.getElementById('ptw-list');if(!el)return;
  if(!list.length){el.innerHTML='<p style="color:var(--muted)">No permits to work yet.</p>';return;}
  var html='<table class="biz-table"><thead><tr><th>PTW #</th><th>Work Type</th><th>Location</th><th>Start</th><th>End</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
  list.forEach(function(p){
    html+='<tr><td><b>'+p.ptwNo+'</b></td><td>'+esc(p.workType||'—')+'</td><td>'+esc(p.location||'—')+'</td>'
      +'<td>'+(p.startTime||'—')+'</td><td>'+(p.endTime||'—')+'</td>'
      +'<td><span class="biz-badge '+(p.status==='Closed'?'biz-badge-green':'biz-badge-orange')+'">'+esc(p.status||'Open')+'</span></td>'
      +'<td><button class="biz-btn" onclick="ptwEdit(\''+p.id+'\')">Edit</button> '
      +'<button class="biz-btn" onclick="ptwPrint(\''+p.id+'\')">Print</button></td></tr>';
  });
  el.innerHTML=html+'</tbody></table>';
}
function ptwNew(){
  var seq=bizSeq('ptw');var pNo='PTW-'+String(seq).padStart(4,'0');
  var obj={id:pNo,ptwNo:pNo,workType:'',location:'',startTime:'',endTime:'',status:'Open',
    isolations:'',hazards:'',auth:'Tseke Riba',ts:Date.now()};
  bizSet('ptw_'+pNo,obj);ptwEdit(pNo);
}
function ptwEdit(id){
  var p=bizGet('ptw_'+id)||{};
  var html='<div class="biz-modal-bg" id="ptw-modal">'
    +'<div class="biz-modal">'
    +'<h3>Permit to Work — '+p.ptwNo+'</h3>'
    +'<label>Work Type *<input id="pw-type" value="'+esc(p.workType||'')+'"></label>'
    +'<label>Location<input id="pw-loc" value="'+esc(p.location||'')+'"></label>'
    +'<label>Planned Start<input type="datetime-local" id="pw-start" value="'+(p.startTime||'')+'"></label>'
    +'<label>Planned End<input type="datetime-local" id="pw-end" value="'+(p.endTime||'')+'"></label>'
    +'<label>Isolations Required<textarea id="pw-iso" rows="2">'+esc(p.isolations||'')+'</textarea></label>'
    +'<label>Known Hazards<textarea id="pw-haz" rows="2">'+esc(p.hazards||'')+'</textarea></label>'
    +'<label>Authorised By<input id="pw-auth" value="'+esc(p.auth||'Tseke Riba')+'"></label>'
    +'<label>Status<select id="pw-status">'
      +['Open','In Progress','Suspended','Closed'].map(function(s){return '<option'+(p.status===s?' selected':'')+'>'+s+'</option>';}).join('')+'</select></label>'
    +'<div class="biz-modal-actions">'
    +'<button class="biz-btn biz-btn-primary" onclick="ptwSave(\''+id+'\')">Save</button> '
    +'<button class="biz-btn" onclick="closeModal(\'ptw-modal\');ptwRender()">Cancel</button>'
    +'<button class="biz-btn biz-btn-danger" style="float:right" onclick="bizDel(\'ptw_'+id+'\');closeModal(\'ptw-modal\');ptwRender()">Delete</button>'
    +'</div></div></div>';
  var old=document.getElementById('ptw-modal');if(old)old.remove();
  document.body.insertAdjacentHTML('beforeend',html);
  var _m=document.body.lastElementChild;if(_m&&_m.classList.contains('biz-modal-bg'))_m.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function ptwSave(id){
  var p=bizGet('ptw_'+id)||{};
  p.workType=val('pw-type');p.location=val('pw-loc');p.startTime=val('pw-start');p.endTime=val('pw-end');
  p.isolations=val('pw-iso');p.hazards=val('pw-haz');p.auth=val('pw-auth');p.status=val('pw-status');p.ts=Date.now();
  bizSet('ptw_'+id,p);closeModal('ptw-modal');ptwRender();
}
function ptwPrint(id){
  var p=bizGet('ptw_'+id);if(!p)return;
  var co=getCompany();
  var w=window.open('','_blank','width=800,height=600');
  w.document.write('<!DOCTYPE html><html><head><title>PTW '+p.ptwNo+'</title>'
    +'<style>body{font-family:Arial,sans-serif;margin:40px;color:#222}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px}th{background:#ffebee}'
    +'h1{color:#c62828}.warn{background:#ffebee;padding:10px;border-left:4px solid #c62828;margin:12px 0}'
    +'</style></head><body>'
    +'<h2>'+esc(co.name||'Ribatt Electrical')+'</h2><h1>⚠ PERMIT TO WORK — '+p.ptwNo+'</h1>'
    +'<div class="warn">This permit authorises specified work only. Any change to scope requires a new permit.</div>'
    +'<table><tr><th>Work Type</th><td colspan="3">'+esc(p.workType||'—')+'</td></tr>'
    +'<tr><th>Location</th><td colspan="3">'+esc(p.location||'—')+'</td></tr>'
    +'<tr><th>Start</th><td>'+esc(p.startTime||'—')+'</td><th>End</th><td>'+esc(p.endTime||'—')+'</td></tr>'
    +'<tr><th>Isolations</th><td colspan="3" style="white-space:pre-wrap">'+esc(p.isolations||'—')+'</td></tr>'
    +'<tr><th>Known Hazards</th><td colspan="3" style="white-space:pre-wrap">'+esc(p.hazards||'—')+'</td></tr>'
    +'<tr><th>Authorised By</th><td>'+esc(p.auth||'—')+'</td><th>Status</th><td>'+esc(p.status||'Open')+'</td></tr></table>'
    +'<br><table><tr><th>Issuer Signature</th><th>Receiver Signature</th><th>Clearance Signature</th></tr>'
    +'<tr><td style="height:60px">___________________<br>Date/Time: __________</td>'
    +'<td>___________________<br>Date/Time: __________</td>'
    +'<td>___________________<br>Date/Time: __________</td></tr></table>'
    +'</body></html>');
  w.document.close();w.print();
}

/* — Incidents — */
function incRender(){
  var list=bizList('inc');list.sort(function(a,b){return b.ts-a.ts;});
  var el=document.getElementById('inc-list');if(!el)return;
  if(!list.length){el.innerHTML='<p style="color:var(--muted)">No incidents recorded. Great — keep the LTI rate at zero!</p>';return;}
  var html='<table class="biz-table"><thead><tr><th>Inc #</th><th>Type</th><th>Date</th><th>Location</th><th>Severity</th><th>Actions</th></tr></thead><tbody>';
  list.forEach(function(i){
    html+='<tr><td><b>'+i.incNo+'</b></td><td>'+esc(i.type||'—')+'</td><td>'+(i.date||'—')+'</td><td>'+esc(i.location||'—')+'</td>'
      +'<td><span class="biz-badge '+(i.severity==='LTI'||i.severity==='Fatality'?'biz-badge-red':'biz-badge-orange')+'">'+esc(i.severity||'Near Miss')+'</span></td>'
      +'<td><button class="biz-btn" onclick="incEdit(\''+i.id+'\')">Edit</button> '
      +'<button class="biz-btn" onclick="incPrint(\''+i.id+'\')">Print</button></td></tr>';
  });
  el.innerHTML=html+'</tbody></table>';
}
function incNew(){
  var seq=bizSeq('inc');var iNo='INC-'+String(seq).padStart(4,'0');
  var obj={id:iNo,incNo:iNo,type:'Near Miss',date:today(),location:'',severity:'Near Miss',
    desc:'',cause:'',corrective:'',reported:'',ts:Date.now()};
  bizSet('inc_'+iNo,obj);incEdit(iNo);
}
function incEdit(id){
  var i=bizGet('inc_'+id)||{};
  var html='<div class="biz-modal-bg" id="inc-modal">'
    +'<div class="biz-modal">'
    +'<h3>Incident Report — '+i.incNo+'</h3>'
    +'<label>Incident Type<select id="im-type">'
      +['Near Miss','First Aid','Medical Treatment','Lost Time Injury (LTI)','Fatality','Property Damage'].map(function(t){return '<option'+(i.type===t?' selected':'')+'>'+t+'</option>';}).join('')
    +'</select></label>'
    +'<label>Date<input type="date" id="im-date" value="'+(i.date||today())+'"></label>'
    +'<label>Location<input id="im-loc" value="'+esc(i.location||'')+'"></label>'
    +'<label>Severity<select id="im-sev">'
      +['Near Miss','Minor','Moderate','Serious','LTI','Fatality'].map(function(s){return '<option'+(i.severity===s?' selected':'')+'>'+s+'</option>';}).join('')
    +'</select></label>'
    +'<label>Description of Incident<textarea id="im-desc" rows="3">'+esc(i.desc||'')+'</textarea></label>'
    +'<label>Root Cause<textarea id="im-cause" rows="2">'+esc(i.cause||'')+'</textarea></label>'
    +'<label>Corrective Action<textarea id="im-corr" rows="2">'+esc(i.corrective||'')+'</textarea></label>'
    +'<label>Reported To<input id="im-rep" value="'+esc(i.reported||'')+'"></label>'
    +'<div class="biz-modal-actions">'
    +'<button class="biz-btn biz-btn-primary" onclick="incSave(\''+id+'\')">Save</button> '
    +'<button class="biz-btn" onclick="closeModal(\'inc-modal\');incRender()">Cancel</button>'
    +'<button class="biz-btn biz-btn-danger" style="float:right" onclick="bizDel(\'inc_'+id+'\');closeModal(\'inc-modal\');incRender()">Delete</button>'
    +'</div></div></div>';
  var old=document.getElementById('inc-modal');if(old)old.remove();
  document.body.insertAdjacentHTML('beforeend',html);
  var _m=document.body.lastElementChild;if(_m&&_m.classList.contains('biz-modal-bg'))_m.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function incSave(id){
  var i=bizGet('inc_'+id)||{};
  i.type=val('im-type');i.date=val('im-date');i.location=val('im-loc');i.severity=val('im-sev');
  i.desc=val('im-desc');i.cause=val('im-cause');i.corrective=val('im-corr');i.reported=val('im-rep');i.ts=Date.now();
  bizSet('inc_'+id,i);closeModal('inc-modal');incRender();
}
function incPrint(id){
  var i=bizGet('inc_'+id);if(!i)return;
  var co=getCompany();
  var w=window.open('','_blank','width=800,height=600');
  w.document.write('<!DOCTYPE html><html><head><title>Incident '+i.incNo+'</title>'
    +'<style>body{font-family:Arial,sans-serif;margin:40px;color:#222}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px}th{background:#eee}</style></head><body>'
    +'<h2>'+esc(co.name||'Ribatt Electrical')+'</h2><h1>INCIDENT REPORT — '+i.incNo+'</h1>'
    +'<table><tr><th>Type</th><td>'+esc(i.type||'—')+'</td><th>Date</th><td>'+i.date+'</td></tr>'
    +'<tr><th>Location</th><td>'+esc(i.location||'—')+'</td><th>Severity</th><td>'+esc(i.severity||'—')+'</td></tr>'
    +'<tr><th>Description</th><td colspan="3" style="white-space:pre-wrap">'+esc(i.desc||'—')+'</td></tr>'
    +'<tr><th>Root Cause</th><td colspan="3" style="white-space:pre-wrap">'+esc(i.cause||'—')+'</td></tr>'
    +'<tr><th>Corrective Action</th><td colspan="3" style="white-space:pre-wrap">'+esc(i.corrective||'—')+'</td></tr>'
    +'<tr><th>Reported To</th><td colspan="3">'+esc(i.reported||'—')+'</td></tr></table>'
    +'<br><table><tr><th style="width:50%">Reporter Signature</th><th>Supervisor Signature</th></tr>'
    +'<tr><td style="height:60px">___________________<br>Date: __________</td><td>___________________<br>Date: __________</td></tr></table>'
    +'</body></html>');
  w.document.close();w.print();
}


/* ═══════════════════════════════════════════════════════════
   PHASE 5 — TEST RECORDS (Electrical & PV)
   ═══════════════════════════════════════════════════════════ */
function tstShow(id){
  document.querySelectorAll('.tst-sub').forEach(function(el){el.classList.remove('active');});
  var t=document.getElementById(id);if(t)t.classList.add('active');
  document.querySelectorAll('.hub-tst-tab').forEach(function(b){b.classList.toggle('active',b.dataset.target===id);});
  if(id==='tst-elec')tstRender();
  else if(id==='tst-pv')pvtRender();
}

/* — Electrical Test Records — */
function tstRender(){
  var list=bizList('tst');list.sort(function(a,b){return b.ts-a.ts;});
  var el=document.getElementById('tst-list');if(!el)return;
  if(!list.length){el.innerHTML='<p style="color:var(--muted)">No test records yet. Click <b>+ New Test Record</b>.</p>';return;}
  var html='<table class="biz-table"><thead><tr><th>Test #</th><th>Client</th><th>Site</th><th>Date</th><th>Circuits</th><th>Result</th><th>Actions</th></tr></thead><tbody>';
  list.forEach(function(t){
    var circs=(t.circuits||[]).length;
    html+='<tr><td><b>'+t.tstNo+'</b></td><td>'+esc(t.clientName||'—')+'</td><td>'+esc(t.site||'—')+'</td><td>'+(t.date||'—')+'</td>'
      +'<td>'+circs+'</td>'
      +'<td><span class="biz-badge '+(t.result==='Pass'?'biz-badge-green':'biz-badge-red')+'">'+esc(t.result||'—')+'</span></td>'
      +'<td><button class="biz-btn" onclick="tstEdit(\''+t.id+'\')">Edit</button> '
      +'<button class="biz-btn" onclick="tstPrint(\''+t.id+'\')">Print</button></td></tr>';
  });
  el.innerHTML=html+'</tbody></table>';
}
function tstNew(){tstEdit(null);}
function tstEdit(id){
  var t=id?bizGet('tst_'+id):{};
  var clients=bizList('cl_');
  var cOpts=clients.map(function(c){return '<option value="'+c.id+'"'+(t.clientId===c.id?' selected':'')+'>'+esc(c.name)+'</option>';}).join('');
  var circs=t.circuits||[];
  var circRows=circs.map(function(c,i){
    return '<tr><td>'+esc(c.id||'')+'</td><td>'+esc(c.desc||'')+'</td><td>'+esc(c.ir||'')+'</td><td>'+esc(c.cont||'')+'</td><td>'+esc(c.rcd||'')+'</td>'
      +'<td><button class="biz-btn biz-btn-xs" onclick="tstRemoveCirc(\''+id+'\','+i+')">✕</button></td></tr>';
  }).join('');
  var html='<div class="biz-modal-bg" id="tst-modal">'
    +'<div class="biz-modal" style="max-width:720px">'
    +'<h3>'+(id?'Edit':'New')+' Electrical Test Record</h3>'
    +'<label>Client<select id="tm-client"><option value="">— Select —</option>'+cOpts+'</select></label>'
    +'<label>Site<input id="tm-site" value="'+esc(t.site||'')+'"></label>'
    +'<label>Date<input type="date" id="tm-date" value="'+(t.date||today())+'"></label>'
    +'<label>Instrument Used<input id="tm-instr" value="'+esc(t.instrument||'Fluke 1507')+'"></label>'
    +'<label>Inspector<input id="tm-insp" value="'+esc(t.inspector||'Tseke Riba')+'"></label>'
    +'<h4 style="margin:10px 0 4px">Circuit Test Results</h4>'
    +'<table class="biz-table" style="font-size:13px"><thead><tr><th>Circuit ID</th><th>Description</th><th>IR (MΩ)</th><th>Continuity (Ω)</th><th>RCD Trip (ms)</th><th></th></tr></thead>'
    +'<tbody id="tst-circs">'+circRows+'</tbody></table>'
    +'<div style="display:flex;gap:6px;margin:8px 0;flex-wrap:wrap">'
    +'<input id="tc-id" placeholder="Circuit ID" style="width:80px">'
    +'<input id="tc-desc" placeholder="Description" style="flex:1;min-width:100px">'
    +'<input id="tc-ir" placeholder="IR MΩ" style="width:70px">'
    +'<input id="tc-cont" placeholder="Cont Ω" style="width:70px">'
    +'<input id="tc-rcd" placeholder="RCD ms" style="width:70px">'
    +'<button class="biz-btn biz-btn-primary" onclick="tstAddCirc(\''+id+'\')">Add</button>'
    +'</div>'
    +'<label>Overall Result<select id="tm-result">'
      +['Pass','Fail','Conditional Pass'].map(function(r){return '<option'+(t.result===r?' selected':'')+'>'+r+'</option>';}).join('')+'</select></label>'
    +'<label>Notes<textarea id="tm-notes" rows="2">'+esc(t.notes||'')+'</textarea></label>'
    +'<div class="biz-modal-actions">'
    +'<button class="biz-btn biz-btn-primary" onclick="tstSave(\''+id+'\')">Save</button> '
    +'<button class="biz-btn" onclick="closeModal(\'tst-modal\');tstRender()">Cancel</button>'
    +(id?'<button class="biz-btn biz-btn-danger" style="float:right" onclick="bizDel(\'tst_'+id+'\');closeModal(\'tst-modal\');tstRender()">Delete</button>':'')
    +'</div></div></div>';
  var old=document.getElementById('tst-modal');if(old)old.remove();
  document.body.insertAdjacentHTML('beforeend',html);
  var _m=document.body.lastElementChild;if(_m&&_m.classList.contains('biz-modal-bg'))_m.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function tstAddCirc(id){
  var t=id?bizGet('tst_'+id):{circuits:[]};
  if(!t.circuits)t.circuits=[];
  t.circuits.push({id:val('tc-id'),desc:val('tc-desc'),ir:val('tc-ir'),cont:val('tc-cont'),rcd:val('tc-rcd')});
  if(id)bizSet('tst_'+id,t);
  tstEdit(id);
}
function tstRemoveCirc(id,idx){
  var t=bizGet('tst_'+id)||{circuits:[]};
  t.circuits.splice(idx,1);bizSet('tst_'+id,t);tstEdit(id);
}
function tstSave(id){
  var clientId=val('tm-client');
  var clients=bizList('cl_');
  var cli=clients.find(function(c){return c.id===clientId;})||{};
  var saved=id?bizGet('tst_'+id):{};
  var seq=id?null:bizSeq('tst');
  var tstNo=id?(saved.tstNo||id):('TST-'+String(seq).padStart(4,'0'));
  var obj=Object.assign(saved,{clientId:clientId,clientName:cli.name||'',site:val('tm-site'),
    date:val('tm-date'),instrument:val('tm-instr'),inspector:val('tm-insp'),
    result:val('tm-result'),notes:val('tm-notes'),tstNo:tstNo,ts:Date.now()});
  if(!id){obj.id=tstNo;}
  bizSet('tst_'+(id||tstNo),obj);
  closeModal('tst-modal');tstRender();
}
function tstPrint(id){
  var t=bizGet('tst_'+id);if(!t)return;
  var co=getCompany();
  var circRows=(t.circuits||[]).map(function(c){
    var irOk=parseFloat(c.ir)>=1;var rcdOk=parseFloat(c.rcd)<=300;
    return '<tr><td>'+esc(c.id||'')+'</td><td>'+esc(c.desc||'')+'</td>'
      +'<td style="color:'+(irOk?'green':'red')+'">'+esc(c.ir||'—')+'</td>'
      +'<td>'+esc(c.cont||'—')+'</td>'
      +'<td style="color:'+(rcdOk?'green':'red')+'">'+esc(c.rcd||'—')+'</td></tr>';
  }).join('');
  var w=window.open('','_blank','width=900,height=700');
  w.document.write('<!DOCTYPE html><html><head><title>Test Record '+t.tstNo+'</title>'
    +'<style>body{font-family:Arial,sans-serif;margin:40px;color:#222}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:7px}th{background:#eee}</style></head><body>'
    +'<h2>'+esc(co.name||'Ribatt Electrical')+'</h2><h1>ELECTRICAL TEST RECORD — '+t.tstNo+'</h1>'
    +'<table><tr><th>Client</th><td>'+esc(t.clientName||'—')+'</td><th>Date</th><td>'+t.date+'</td></tr>'
    +'<tr><th>Site</th><td colspan="3">'+esc(t.site||'—')+'</td></tr>'
    +'<tr><th>Instrument</th><td>'+esc(t.instrument||'—')+'</td><th>Inspector</th><td>'+esc(t.inspector||'—')+'</td></tr>'
    +'<tr><th>Overall Result</th><td colspan="3" style="font-weight:bold;color:'+(t.result==='Pass'?'green':'red')+'">'+esc(t.result||'—')+'</td></tr></table>'
    +'<h3>Circuit Test Results</h3>'
    +'<table><thead><tr><th>Circuit ID</th><th>Description</th><th>IR (MΩ) ≥1</th><th>Continuity (Ω)</th><th>RCD (ms) ≤300</th></tr></thead><tbody>'+(circRows||'<tr><td colspan="5">No circuits</td></tr>')+'</tbody></table>'
    +'<p style="white-space:pre-wrap"><b>Notes:</b> '+esc(t.notes||'—')+'</p>'
    +'<br><table><tr><th>Inspector Signature</th><th>Client Acceptance</th></tr>'
    +'<tr><td style="height:50px">___________________<br>Date: __________</td><td>___________________<br>Date: __________</td></tr></table>'
    +'<p style="font-size:11px">Tested per SANS 10142-1. IR≥1MΩ, RCD trip ≤300ms.</p>'
    +'</body></html>');
  w.document.close();w.print();
}

/* — PV Test Records — */
function pvtRender(){
  var list=bizList('pvt');list.sort(function(a,b){return b.ts-a.ts;});
  var el=document.getElementById('pvt-list');if(!el)return;
  if(!list.length){el.innerHTML='<p style="color:var(--muted)">No PV test records yet. Click <b>+ New PV Test</b>.</p>';return;}
  var html='<table class="biz-table"><thead><tr><th>Test #</th><th>Client</th><th>Site</th><th>Date</th><th>Strings</th><th>Result</th><th>Actions</th></tr></thead><tbody>';
  list.forEach(function(p){
    html+='<tr><td><b>'+p.pvtNo+'</b></td><td>'+esc(p.clientName||'—')+'</td><td>'+esc(p.site||'—')+'</td><td>'+(p.date||'—')+'</td>'
      +'<td>'+((p.strings||[]).length)+'</td>'
      +'<td><span class="biz-badge '+(p.result==='Pass'?'biz-badge-green':'biz-badge-red')+'">'+esc(p.result||'—')+'</span></td>'
      +'<td><button class="biz-btn" onclick="pvtEdit(\''+p.id+'\')">Edit</button> '
      +'<button class="biz-btn" onclick="pvtPrint(\''+p.id+'\')">Print</button></td></tr>';
  });
  el.innerHTML=html+'</tbody></table>';
}
function pvtNew(){pvtEdit(null);}
function pvtEdit(id){
  var p=id?bizGet('pvt_'+id):{};
  var clients=bizList('cl_');
  var cOpts=clients.map(function(c){return '<option value="'+c.id+'"'+(p.clientId===c.id?' selected':'')+'>'+esc(c.name)+'</option>';}).join('');
  var strings=p.strings||[];
  var strRows=strings.map(function(s,i){
    return '<tr><td>'+esc(s.id||'')+'</td><td>'+esc(s.panels||'')+'</td><td>'+esc(s.voc||'')+'</td><td>'+esc(s.isc||'')+'</td><td>'+esc(s.ir||'')+'</td><td>'+esc(s.pmax||'')+'</td>'
      +'<td><button class="biz-btn biz-btn-xs" onclick="pvtRemoveStr(\''+id+'\','+i+')">✕</button></td></tr>';
  }).join('');
  var html='<div class="biz-modal-bg" id="pvt-modal">'
    +'<div class="biz-modal" style="max-width:760px">'
    +'<h3>'+(id?'Edit':'New')+' PV System Test Record</h3>'
    +'<label>Client<select id="pv-client"><option value="">— Select —</option>'+cOpts+'</select></label>'
    +'<label>Site<input id="pv-site" value="'+esc(p.site||'')+'"></label>'
    +'<label>Date<input type="date" id="pv-date" value="'+(p.date||today())+'"></label>'
    +'<label>System Size (kWp)<input type="number" id="pv-kw" value="'+(p.kw||0)+'" min="0" step="0.01"></label>'
    +'<label>Inverter Make/Model<input id="pv-inv" value="'+esc(p.inverter||'')+'"></label>'
    +'<label>Panel Make/Model<input id="pv-pan" value="'+esc(p.panel||'')+'"></label>'
    +'<label>Inspector<input id="pv-insp" value="'+esc(p.inspector||'Tseke Riba')+'"></label>'
    +'<h4 style="margin:10px 0 4px">String Test Results</h4>'
    +'<table class="biz-table" style="font-size:13px"><thead><tr><th>String ID</th><th># Panels</th><th>Voc (V)</th><th>Isc (A)</th><th>IR (MΩ)</th><th>Pmax (W)</th><th></th></tr></thead>'
    +'<tbody id="pvt-strings">'+strRows+'</tbody></table>'
    +'<div style="display:flex;gap:6px;margin:8px 0;flex-wrap:wrap">'
    +'<input id="ps-id" placeholder="String ID" style="width:70px">'
    +'<input id="ps-panels" placeholder="# panels" style="width:70px">'
    +'<input id="ps-voc" placeholder="Voc" style="width:70px">'
    +'<input id="ps-isc" placeholder="Isc" style="width:70px">'
    +'<input id="ps-ir" placeholder="IR MΩ" style="width:70px">'
    +'<input id="ps-pmax" placeholder="Pmax W" style="width:70px">'
    +'<button class="biz-btn biz-btn-primary" onclick="pvtAddString(\''+id+'\')">Add String</button>'
    +'</div>'
    +'<label>Overall Result<select id="pv-result">'
      +['Pass','Fail','Conditional Pass'].map(function(r){return '<option'+(p.result===r?' selected':'')+'>'+r+'</option>';}).join('')+'</select></label>'
    +'<label>Notes<textarea id="pv-notes" rows="2">'+esc(p.notes||'')+'</textarea></label>'
    +'<div class="biz-modal-actions">'
    +'<button class="biz-btn biz-btn-primary" onclick="pvtSave(\''+id+'\')">Save</button> '
    +'<button class="biz-btn" onclick="closeModal(\'pvt-modal\');pvtRender()">Cancel</button>'
    +(id?'<button class="biz-btn biz-btn-danger" style="float:right" onclick="bizDel(\'pvt_'+id+'\');closeModal(\'pvt-modal\');pvtRender()">Delete</button>':'')
    +'</div></div></div>';
  var old=document.getElementById('pvt-modal');if(old)old.remove();
  document.body.insertAdjacentHTML('beforeend',html);
  var _m=document.body.lastElementChild;if(_m&&_m.classList.contains('biz-modal-bg'))_m.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function pvtAddString(id){
  var p=id?bizGet('pvt_'+id):{strings:[]};
  if(!p.strings)p.strings=[];
  p.strings.push({id:val('ps-id'),panels:val('ps-panels'),voc:val('ps-voc'),isc:val('ps-isc'),ir:val('ps-ir'),pmax:val('ps-pmax')});
  if(id)bizSet('pvt_'+id,p);pvtEdit(id);
}
function pvtRemoveStr(id,idx){
  var p=bizGet('pvt_'+id)||{strings:[]};p.strings.splice(idx,1);bizSet('pvt_'+id,p);pvtEdit(id);
}
function pvtSave(id){
  var clientId=val('pv-client');
  var clients=bizList('cl_');
  var cli=clients.find(function(c){return c.id===clientId;})||{};
  var saved=id?bizGet('pvt_'+id):{};
  var seq=id?null:bizSeq('pvt');
  var pvtNo=id?(saved.pvtNo||id):('PVT-'+String(seq).padStart(4,'0'));
  var obj=Object.assign(saved,{clientId:clientId,clientName:cli.name||'',site:val('pv-site'),
    date:val('pv-date'),kw:parseFloat(val('pv-kw'))||0,inverter:val('pv-inv'),panel:val('pv-pan'),
    inspector:val('pv-insp'),result:val('pv-result'),notes:val('pv-notes'),pvtNo:pvtNo,ts:Date.now()});
  if(!id){obj.id=pvtNo;}
  bizSet('pvt_'+(id||pvtNo),obj);
  closeModal('pvt-modal');pvtRender();
}
function pvtPrint(id){
  var p=bizGet('pvt_'+id);if(!p)return;
  var co=getCompany();
  var strRows=(p.strings||[]).map(function(s){
    return '<tr><td>'+esc(s.id||'')+'</td><td>'+esc(s.panels||'')+'</td><td>'+esc(s.voc||'')+'</td><td>'+esc(s.isc||'')+'</td><td>'+esc(s.ir||'')+'</td><td>'+esc(s.pmax||'')+'</td></tr>';
  }).join('');
  var w=window.open('','_blank','width=900,height=700');
  w.document.write('<!DOCTYPE html><html><head><title>PV Test '+p.pvtNo+'</title>'
    +'<style>body{font-family:Arial,sans-serif;margin:40px;color:#222}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:7px}th{background:#eee}</style></head><body>'
    +'<h2>'+esc(co.name||'Ribatt Electrical')+'</h2><h1>PV SYSTEM TEST RECORD — '+p.pvtNo+'</h1>'
    +'<table><tr><th>Client</th><td>'+esc(p.clientName||'—')+'</td><th>Date</th><td>'+p.date+'</td></tr>'
    +'<tr><th>Site</th><td colspan="3">'+esc(p.site||'—')+'</td></tr>'
    +'<tr><th>System Size</th><td>'+p.kw+' kWp</td><th>Inverter</th><td>'+esc(p.inverter||'—')+'</td></tr>'
    +'<tr><th>Panel Type</th><td>'+esc(p.panel||'—')+'</td><th>Inspector</th><td>'+esc(p.inspector||'—')+'</td></tr>'
    +'<tr><th>Result</th><td colspan="3" style="font-weight:bold;color:'+(p.result==='Pass'?'green':'red')+'">'+esc(p.result||'—')+'</td></tr></table>'
    +'<h3>String Test Results</h3>'
    +'<table><thead><tr><th>String</th><th>Panels</th><th>Voc (V)</th><th>Isc (A)</th><th>IR (MΩ)</th><th>Pmax (W)</th></tr></thead><tbody>'+(strRows||'<tr><td colspan="6">No strings</td></tr>')+'</tbody></table>'
    +'<p><b>Notes:</b> '+esc(p.notes||'—')+'</p>'
    +'<br><table><tr><th>Inspector Signature</th><th>Client Acceptance</th></tr>'
    +'<tr><td style="height:50px">___________________</td><td>___________________</td></tr></table>'
    +'<p style="font-size:11px">PV testing per SANS 61215 / IEC 62446. SANS 10142-1 applies to AC wiring.</p>'
    +'</body></html>');
  w.document.close();w.print();
}


/* ═══════════════════════════════════════════════════════════
   HR / PAYROLL
   ═══════════════════════════════════════════════════════════ */
function hrShow(id){
  document.querySelectorAll('.hr-sub').forEach(function(el){el.classList.remove('active');});
  var t=document.getElementById(id);if(t)t.classList.add('active');
  document.querySelectorAll('.hub-hr-tab').forEach(function(b){b.classList.toggle('active',b.dataset.target===id);});
  if(id==='hr-emp')empRender();
  else if(id==='hr-pay')payRender();
  else if(id==='hr-kpi')kpiRender();
  else if(id==='hr-mem')memRender();
  else if(id==='hr-agr')agrRender();
}

/* — Seed Tseke — */
function hrSeedTseke(){
  if(bizGet('emp_EMP0001'))return;
  bizSet('emp_EMP0001',{id:'EMP0001',empNo:'EMP0001',name:'Tshegofatso Tseke Riba',
    jobTitle:'Director / Installation Electrician',dept:'Management',
    startDate:'2024-01-01',idNo:'',bank:'Capitec Bank',accNo:'2605150883',branch:'470010',
    salary:0,uifRate:1,phone:'072 474 8888',email:'ribattseke@gmail.com',
    regNo:'',ecsaReg:'',skills:'Electrical Installation, Training, DB Inspection',
    ts:Date.now()});
}

/* — Employees — */
function empRender(){
  hrSeedTseke();
  var list=bizList('emp');list.sort(function(a,b){return a.empNo>b.empNo?1:-1;});
  var el=document.getElementById('emp-list');if(!el)return;
  if(!list.length){el.innerHTML='<p style="color:var(--muted)">No employees yet.</p>';return;}
  var html='<table class="biz-table"><thead><tr><th>Emp #</th><th>Name</th><th>Job Title</th><th>Dept</th><th>Start Date</th><th>Actions</th></tr></thead><tbody>';
  list.forEach(function(e){
    html+='<tr><td><b>'+e.empNo+'</b></td><td>'+esc(e.name||'—')+'</td><td>'+esc(e.jobTitle||'—')+'</td><td>'+esc(e.dept||'—')+'</td><td>'+(e.startDate||'—')+'</td>'
      +'<td><button class="biz-btn" onclick="empEdit(\''+e.id+'\')">Edit</button> '
      +'<button class="biz-btn biz-btn-teal" onclick="payNew(\''+e.id+'\')">Pay</button></td></tr>';
  });
  el.innerHTML=html+'</tbody></table>';
}
function empNew(){empEdit(null);}
function empEdit(id){
  var e=id?bizGet('emp_'+id):{};
  var html='<div class="biz-modal-bg" id="emp-modal">'
    +'<div class="biz-modal" style="max-width:580px">'
    +'<h3>'+(id?'Edit':'New')+' Employee</h3>'
    +'<label>Full Name *<input id="em-name" value="'+esc(e.name||'')+'"></label>'
    +'<label>Job Title *<input id="em-title" value="'+esc(e.jobTitle||'')+'"></label>'
    +'<label>Department<input id="em-dept" value="'+esc(e.dept||'')+'"></label>'
    +'<label>Start Date<input type="date" id="em-start" value="'+(e.startDate||today())+'"></label>'
    +'<label>ID Number<input id="em-id" value="'+esc(e.idNo||'')+'"></label>'
    +'<label>Phone<input id="em-phone" value="'+esc(e.phone||'')+'"></label>'
    +'<label>Email<input id="em-email" value="'+esc(e.email||'')+'"></label>'
    +'<label>Bank<input id="em-bank" value="'+esc(e.bank||'')+'"></label>'
    +'<label>Account Number<input id="em-acc" value="'+esc(e.accNo||'')+'"></label>'
    +'<label>Branch Code<input id="em-branch" value="'+esc(e.branch||'')+'"></label>'
    +'<label>Basic Salary (R/month)<input type="number" id="em-salary" value="'+(e.salary||0)+'" min="0"></label>'
    +'<label>UIF % (employer)<input type="number" id="em-uif" value="'+(e.uifRate||1)+'" min="0" max="2" step="0.1"></label>'
    +'<label>ECSA Registration #<input id="em-ecsa" value="'+esc(e.ecsaReg||'')+'"></label>'
    +'<label>Skills / Qualifications<textarea id="em-skills" rows="2">'+esc(e.skills||'')+'</textarea></label>'
    +'<div class="biz-modal-actions">'
    +'<button class="biz-btn biz-btn-primary" onclick="empSave(\''+id+'\')">Save</button> '
    +'<button class="biz-btn" onclick="closeModal(\'emp-modal\')">Cancel</button>'
    +(id&&id!=='EMP0001'?'<button class="biz-btn biz-btn-danger" style="float:right" onclick="bizDel(\'emp_'+id+'\');closeModal(\'emp-modal\');empRender()">Delete</button>':'')
    +'</div></div></div>';
  document.body.insertAdjacentHTML('beforeend',html);
  var _m=document.body.lastElementChild;if(_m&&_m.classList.contains('biz-modal-bg'))_m.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function empSave(id){
  var name=val('em-name').trim();var title=val('em-title').trim();
  if(!name||!title){alert('Name and job title are required.');return;}
  var saved=id?bizGet('emp_'+id):{};
  var seq=id?null:bizSeq('emp');
  var empNo=id?(saved.empNo||id):('EMP'+String(seq).padStart(4,'0'));
  var obj=Object.assign(saved,{name:name,jobTitle:title,dept:val('em-dept'),startDate:val('em-start'),
    idNo:val('em-id'),phone:val('em-phone'),email:val('em-email'),bank:val('em-bank'),accNo:val('em-acc'),
    branch:val('em-branch'),salary:parseFloat(val('em-salary'))||0,uifRate:parseFloat(val('em-uif'))||1,
    ecsaReg:val('em-ecsa'),skills:val('em-skills'),empNo:empNo,ts:Date.now()});
  if(!id){obj.id=empNo;}
  bizSet('emp_'+(id||empNo),obj);
  closeModal('emp-modal');empRender();
}

/* — Payslips — */
var SA_MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
function payRender(){
  var list=bizList('pay');list.sort(function(a,b){return b.ts-a.ts;});
  var el=document.getElementById('pay-list');if(!el)return;
  if(!list.length){el.innerHTML='<p style="color:var(--muted)">No payslips yet. Click <b>+ New Payslip</b>.</p>';return;}
  var html='<table class="biz-table"><thead><tr><th>Slip #</th><th>Employee</th><th>Period</th><th>Gross (R)</th><th>Net (R)</th><th>Actions</th></tr></thead><tbody>';
  list.forEach(function(p){
    html+='<tr><td><b>'+p.slipNo+'</b></td><td>'+esc(p.empName||'—')+'</td><td>'+esc(p.period||'—')+'</td>'
      +'<td>'+fmt(p.gross||0)+'</td><td>'+fmt(p.net||0)+'</td>'
      +'<td><button class="biz-btn" onclick="payEdit(\''+p.id+'\')">Edit</button> '
      +'<button class="biz-btn" onclick="payPrint(\''+p.id+'\')">Print</button></td></tr>';
  });
  el.innerHTML=html+'</tbody></table>';
}
function payNew(preEmpId){
  var now=new Date();
  var period=SA_MONTHS[now.getMonth()]+' '+now.getFullYear();
  var emps=bizList('emp');
  var emp=emps.find(function(e){return e.id===preEmpId;})||emps[0]||{};
  var seq=bizSeq('pay');var slipNo='PAY-'+String(seq).padStart(4,'0');
  var uif=Math.round((emp.salary||0)*0.01*100)/100;
  var net=(emp.salary||0)-uif;
  var obj={id:slipNo,slipNo:slipNo,empId:emp.id||'',empName:emp.name||'',period:period,
    basic:emp.salary||0,allowances:0,deductions:uif,uif:uif,gross:emp.salary||0,net:net,ts:Date.now()};
  bizSet('pay_'+slipNo,obj);payEdit(slipNo);
}
function payEdit(id){
  var p=bizGet('pay_'+id)||{};
  var emps=bizList('emp');
  var eOpts=emps.map(function(e){return '<option value="'+e.id+'"'+(p.empId===e.id?' selected':'')+'>'+esc(e.name)+'</option>';}).join('');
  var yearNow=new Date().getFullYear();
  var periodOpts=[];
  for(var y=yearNow;y>=yearNow-2;y--){
    SA_MONTHS.slice().reverse().forEach(function(m){periodOpts.push(m+' '+y);});
  }
  var pOpts=periodOpts.map(function(o){return '<option'+(p.period===o?' selected':'')+'>'+o+'</option>';}).join('');
  var html='<div class="biz-modal-bg" id="pay-modal">'
    +'<div class="biz-modal" style="max-width:500px">'
    +'<h3>Payslip — '+p.slipNo+'</h3>'
    +'<label>Employee<select id="py-emp" onchange="payLoadEmp()"><option value="">— Select —</option>'+eOpts+'</select></label>'
    +'<label>Period<select id="py-period">'+pOpts+'</select></label>'
    +'<label>Basic Salary (R)<input type="number" id="py-basic" value="'+(p.basic||0)+'" min="0" oninput="payCalcNet()"></label>'
    +'<label>Allowances (R)<input type="number" id="py-allow" value="'+(p.allowances||0)+'" min="0" oninput="payCalcNet()"></label>'
    +'<label>UIF Deduction (R) <small style="color:var(--muted)">(1% of basic)</small><input type="number" id="py-uif" value="'+(p.uif||0)+'" min="0" oninput="payCalcNet()"></label>'
    +'<label>Other Deductions (R)<input type="number" id="py-ded" value="'+(p.deductions||0)+'" min="0" oninput="payCalcNet()"></label>'
    +'<div style="background:var(--surface2,#f5f5f5);padding:10px;border-radius:6px;margin:8px 0">'
    +'<b>Gross: R <span id="py-gross">'+fmt(p.gross||0)+'</span></b><br>'
    +'<b>Net Pay: R <span id="py-net">'+fmt(p.net||0)+'</span></b>'
    +'</div>'
    +'<label>Notes<input id="py-notes" value="'+esc(p.notes||'')+'"></label>'
    +'<div class="biz-modal-actions">'
    +'<button class="biz-btn biz-btn-primary" onclick="paySave(\''+id+'\')">Save</button> '
    +'<button class="biz-btn" onclick="closeModal(\'pay-modal\')">Cancel</button>'
    +'<button class="biz-btn biz-btn-danger" style="float:right" onclick="bizDel(\'pay_'+id+'\');closeModal(\'pay-modal\');payRender()">Delete</button>'
    +'</div></div></div>';
  var old=document.getElementById('pay-modal');if(old)old.remove();
  document.body.insertAdjacentHTML('beforeend',html);
  var _m=document.body.lastElementChild;if(_m&&_m.classList.contains('biz-modal-bg'))_m.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function payLoadEmp(){
  var empId=val('py-emp');
  var emps=bizList('emp');
  var emp=emps.find(function(e){return e.id===empId;})||{};
  if(emp.salary){document.getElementById('py-basic').value=emp.salary;}
  payAutoUIF();payCalcNet();
}
function payAutoUIF(){
  var basic=parseFloat(document.getElementById('py-basic')?document.getElementById('py-basic').value:0)||0;
  var uifEl=document.getElementById('py-uif');
  if(uifEl)uifEl.value=(Math.round(basic*0.01*100)/100).toFixed(2);
}
function payCalcNet(){
  var basic=parseFloat(document.getElementById('py-basic')?document.getElementById('py-basic').value:0)||0;
  var allow=parseFloat(document.getElementById('py-allow')?document.getElementById('py-allow').value:0)||0;
  var uif=parseFloat(document.getElementById('py-uif')?document.getElementById('py-uif').value:0)||0;
  var ded=parseFloat(document.getElementById('py-ded')?document.getElementById('py-ded').value:0)||0;
  var gross=basic+allow;var net=gross-uif-ded;
  var gEl=document.getElementById('py-gross');var nEl=document.getElementById('py-net');
  if(gEl)gEl.textContent=fmt(gross);if(nEl)nEl.textContent=fmt(net);
}
function paySave(id){
  var p=bizGet('pay_'+id)||{};
  var empId=val('py-emp');
  var emps=bizList('emp');
  var emp=emps.find(function(e){return e.id===empId;})||{};
  var basic=parseFloat(val('py-basic'))||0;
  var allow=parseFloat(val('py-allow'))||0;
  var uif=parseFloat(val('py-uif'))||0;
  var ded=parseFloat(val('py-ded'))||0;
  var gross=basic+allow;var net=gross-uif-ded;
  Object.assign(p,{empId:empId,empName:emp.name||'',period:val('py-period'),
    basic:basic,allowances:allow,uif:uif,deductions:ded,gross:gross,net:net,notes:val('py-notes'),ts:Date.now()});
  bizSet('pay_'+id,p);closeModal('pay-modal');payRender();
}
function payPrint(id){
  var p=bizGet('pay_'+id);if(!p)return;
  var emp=bizGet('emp_'+p.empId)||{};
  var co=getCompany();
  var w=window.open('','_blank','width=600,height=700');
  w.document.write('<!DOCTYPE html><html><head><title>Payslip '+p.slipNo+'</title>'
    +'<style>body{font-family:Arial,sans-serif;margin:40px;color:#222;max-width:500px}'
    +'.hdr{display:flex;justify-content:space-between}.slip{border:2px solid #333;padding:20px;margin:20px 0}'
    +'.row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #eee}'
    +'.total{font-weight:bold;font-size:1.1em;border-top:2px solid #333;padding-top:8px}'
    +'.notice{background:#fff3cd;padding:8px;border-left:4px solid #f0a500;margin:12px 0;font-size:12px}'
    +'</style></head><body>'
    +'<div class="hdr"><div><h2>'+esc(co.name||'Ribatt Electrical')+'</h2><small>'+esc(co.reg||'')+'</small></div>'
    +'<div style="text-align:right"><h3>PAYSLIP</h3><small>'+p.slipNo+'</small></div></div>'
    +'<div class="notice">⚠ This company is NOT VAT registered. No VAT applicable.</div>'
    +'<div class="slip">'
    +'<div class="row"><span>Employee</span><span><b>'+esc(p.empName||'—')+'</b></span></div>'
    +'<div class="row"><span>Employee #</span><span>'+esc(emp.empNo||'—')+'</span></div>'
    +'<div class="row"><span>Job Title</span><span>'+esc(emp.jobTitle||'—')+'</span></div>'
    +'<div class="row"><span>Period</span><span>'+esc(p.period||'—')+'</span></div>'
    +'<div class="row"><span>Bank</span><span>'+esc(emp.bank||'—')+'</span></div>'
    +'<div class="row"><span>Account #</span><span>'+esc(emp.accNo||'—')+'</span></div>'
    +'<br><div class="row"><span>Basic Salary</span><span>R '+fmt(p.basic||0)+'</span></div>'
    +'<div class="row"><span>Allowances</span><span>R '+fmt(p.allowances||0)+'</span></div>'
    +'<div class="row total"><span>GROSS PAY</span><span>R '+fmt(p.gross||0)+'</span></div>'
    +'<br><div class="row"><span>UIF (Employee 1%)</span><span>- R '+fmt(p.uif||0)+'</span></div>'
    +'<div class="row"><span>Other Deductions</span><span>- R '+fmt(p.deductions||0)+'</span></div>'
    +'<div class="row total"><span>NET PAY</span><span>R '+fmt(p.net||0)+'</span></div>'
    +'</div>'
    +(p.notes?'<p><i>'+esc(p.notes)+'</i></p>':'')
    +'<p style="font-size:11px;color:#666">UIF: Employer also contributes 1% (R '+fmt((p.basic||0)*0.01)+'). Total UIF = R '+fmt((p.basic||0)*0.02)+'.<br>PAYE: Not applicable (earnings below threshold or Director loan arrangement).</p>'
    +'</body></html>');
  w.document.close();w.print();
}

/* — KPI Scorecards — */
var KPI_ITEMS=[
  {key:'cocs',label:'CoCs Issued',target:4,unit:'per month'},
  {key:'jobs',label:'Jobs Completed',target:8,unit:'per month'},
  {key:'revenue',label:'Revenue (R)',target:20000,unit:'per month'},
  {key:'invoices',label:'Invoices Outstanding',target:2,unit:'max'},
  {key:'lti',label:'Lost Time Injuries',target:0,unit:'zero target'},
  {key:'csat',label:'Customer Satisfaction',target:4,unit:'/5 rating'},
  {key:'cpd',label:'CPD Hours',target:3,unit:'per month'},
  {key:'quotes',label:'Quote Conversion %',target:50,unit:'%'}
];
function kpiRender(){
  var list=bizList('kpi');list.sort(function(a,b){return b.ts-a.ts;});
  var el=document.getElementById('kpi-list');if(!el)return;
  if(!list.length){el.innerHTML='<p style="color:var(--muted)">No KPI scorecards yet. Click <b>+ New KPI Scorecard</b>.</p>';return;}
  var html='<table class="biz-table"><thead><tr><th>KPI #</th><th>Employee</th><th>Period</th><th>Score</th><th>Actions</th></tr></thead><tbody>';
  list.forEach(function(k){
    html+='<tr><td><b>'+k.kpiNo+'</b></td><td>'+esc(k.empName||'—')+'</td><td>'+esc(k.period||'—')+'</td>'
      +'<td><span class="biz-badge '+(k.score>=80?'biz-badge-green':k.score>=50?'biz-badge-orange':'biz-badge-red')+'">'+Math.round(k.score||0)+'%</span></td>'
      +'<td><button class="biz-btn" onclick="kpiEdit(\''+k.id+'\')">View</button> '
      +'<button class="biz-btn" onclick="kpiPrint(\''+k.id+'\')">Print</button></td></tr>';
  });
  el.innerHTML=html+'</tbody></table>';
}
function kpiNew(preEmpId){
  var now=new Date();
  var period=SA_MONTHS[now.getMonth()]+' '+now.getFullYear();
  var emps=bizList('emp');
  var emp=emps.find(function(e){return e.id===preEmpId;})||emps[0]||{};
  var seq=bizSeq('kpi');var kpiNo='KPI-'+String(seq).padStart(4,'0');
  var vals={};KPI_ITEMS.forEach(function(k){vals[k.key]=0;});
  var obj={id:kpiNo,kpiNo:kpiNo,empId:emp.id||'',empName:emp.name||'',period:period,vals:vals,score:0,ts:Date.now()};
  bizSet('kpi_'+kpiNo,obj);kpiEdit(kpiNo);
}
function kpiEdit(id){
  var k=bizGet('kpi_'+id)||{vals:{}};
  var emps=bizList('emp');
  var eOpts=emps.map(function(e){return '<option value="'+e.id+'"'+(k.empId===e.id?' selected':'')+'>'+esc(e.name)+'</option>';}).join('');
  var yearNow=new Date().getFullYear();
  var periodOpts=[];
  for(var y=yearNow;y>=yearNow-2;y--){SA_MONTHS.slice().reverse().forEach(function(m){periodOpts.push(m+' '+y);});}
  var pOpts=periodOpts.map(function(o){return '<option'+(k.period===o?' selected':'')+'>'+o+'</option>';}).join('');
  var kpiRows=KPI_ITEMS.map(function(item){
    var v=(k.vals&&k.vals[item.key])||0;
    return '<tr><td>'+esc(item.label)+'</td><td>'+esc(item.unit)+'</td><td style="color:var(--muted)">'+item.target+'</td>'
      +'<td><input type="number" id="kv-'+item.key+'" value="'+v+'" min="0" oninput="kpiCalc()" style="width:80px"></td></tr>';
  }).join('');
  var html='<div class="biz-modal-bg" id="kpi-modal">'
    +'<div class="biz-modal" style="max-width:580px">'
    +'<h3>KPI Scorecard — '+k.kpiNo+'</h3>'
    +'<label>Employee<select id="ki-emp"><option value="">— Select —</option>'+eOpts+'</select></label>'
    +'<label>Period<select id="ki-period">'+pOpts+'</select></label>'
    +'<h4>Performance Metrics</h4>'
    +'<table class="biz-table"><thead><tr><th>Metric</th><th>Unit</th><th>Target</th><th>Actual</th></tr></thead><tbody>'+kpiRows+'</tbody></table>'
    +'<div style="background:var(--surface2,#f5f5f5);padding:10px;border-radius:6px;margin:8px 0">'
    +'Overall Score: <b id="kpi-score">'+Math.round(k.score||0)+'%</b></div>'
    +'<div class="biz-modal-actions">'
    +'<button class="biz-btn biz-btn-primary" onclick="kpiSave(\''+id+'\')">Save</button> '
    +'<button class="biz-btn" onclick="closeModal(\'kpi-modal\')">Cancel</button>'
    +'<button class="biz-btn biz-btn-danger" style="float:right" onclick="bizDel(\'kpi_'+id+'\');closeModal(\'kpi-modal\');kpiRender()">Delete</button>'
    +'</div></div></div>';
  var old=document.getElementById('kpi-modal');if(old)old.remove();
  document.body.insertAdjacentHTML('beforeend',html);
  var _m=document.body.lastElementChild;if(_m&&_m.classList.contains('biz-modal-bg'))_m.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function kpiCalc(){
  var scores=KPI_ITEMS.map(function(item){
    var v=parseFloat(document.getElementById('kv-'+item.key)?document.getElementById('kv-'+item.key).value:0)||0;
    if(item.key==='lti')return v===0?100:0;
    return Math.min(100,(v/item.target)*100);
  });
  var avg=scores.reduce(function(a,b){return a+b;},0)/scores.length;
  var el=document.getElementById('kpi-score');if(el)el.textContent=Math.round(avg)+'%';
  return avg;
}
function kpiSave(id){
  var k=bizGet('kpi_'+id)||{};
  var empId=val('ki-emp');var emps=bizList('emp');var emp=emps.find(function(e){return e.id===empId;})||{};
  var vals={};KPI_ITEMS.forEach(function(item){vals[item.key]=parseFloat(document.getElementById('kv-'+item.key)?document.getElementById('kv-'+item.key).value:0)||0;});
  var score=kpiCalc();
  Object.assign(k,{empId:empId,empName:emp.name||'',period:val('ki-period'),vals:vals,score:score,ts:Date.now()});
  bizSet('kpi_'+id,k);closeModal('kpi-modal');kpiRender();
}
function kpiPrint(id){
  var k=bizGet('kpi_'+id);if(!k)return;
  var co=getCompany();
  var rows=KPI_ITEMS.map(function(item){
    var v=(k.vals&&k.vals[item.key])||0;
    var pct=item.key==='lti'?(v===0?100:0):Math.min(100,Math.round((v/item.target)*100));
    var color=pct>=80?'green':pct>=50?'orange':'red';
    return '<tr><td>'+esc(item.label)+'</td><td>'+item.target+' '+esc(item.unit)+'</td><td>'+v+'</td><td style="color:'+color+'">'+pct+'%</td></tr>';
  }).join('');
  var w=window.open('','_blank','width=700,height=600');
  w.document.write('<!DOCTYPE html><html><head><title>KPI '+k.kpiNo+'</title>'
    +'<style>body{font-family:Arial,sans-serif;margin:40px;color:#222}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px}th{background:#eee}</style></head><body>'
    +'<h2>'+esc(co.name||'Ribatt Electrical')+'</h2><h1>KPI SCORECARD — '+k.kpiNo+'</h1>'
    +'<table><tr><th>Employee</th><td>'+esc(k.empName||'—')+'</td><th>Period</th><td>'+esc(k.period||'—')+'</td></tr></table>'
    +'<h3>Performance Results</h3>'
    +'<table><thead><tr><th>Metric</th><th>Target</th><th>Actual</th><th>Score</th></tr></thead><tbody>'+rows+'</tbody></table>'
    +'<h2 style="margin-top:16px">Overall Score: '+Math.round(k.score||0)+'%</h2>'
    +'<br><table><tr><th>Employee Signature</th><th>Manager Signature</th></tr>'
    +'<tr><td style="height:50px">___________________</td><td>___________________</td></tr></table>'
    +'</body></html>');
  w.document.close();w.print();
}

/* — Memberships — */
var MEMBERSHIP_DEFAULTS=[
  {org:'SAIEE',name:'South African Institute of Electrical Engineers',cat:'Professional',annual:0,due:''},
  {org:'ECA(SA)',name:'Electrical Contractors\' Association',cat:'Trade',annual:0,due:''},
  {org:'AREP',name:'Approved Registration of Electrical Practitioners',cat:'Regulatory',annual:0,due:''},
  {org:'SAEEC',name:'South African Association of Energy Efficiency',cat:'Professional',annual:0,due:''},
  {org:'SAPVIA',name:'South African Photovoltaic Industry Association',cat:'Industry',annual:0,due:''},
  {org:'CET',name:'Certificate of Electrical Training',cat:'Training',annual:0,due:''},
  {org:'EWSETA Assessor',name:'EWSETA Registered Assessor',cat:'Training Authority',annual:0,due:''},
  {org:'NAMB Assessor/Moderator',name:'NAMB Assessor / Moderator',cat:'Training Authority',annual:0,due:''},
  {org:'PI Insurance',name:'Professional Indemnity Insurance',cat:'Insurance',annual:0,due:''}
];
function memRender(){
  var list=bizList('mem');list.sort(function(a,b){return a.org>b.org?1:-1;});
  var el=document.getElementById('mem-list');if(!el)return;
  if(!list.length){
    el.innerHTML='<p style="color:var(--muted)">No memberships yet. '
      +'<button class="biz-btn" onclick="memLoadDefaults()">Load defaults</button></p>';
    return;
  }
  var html='<table class="biz-table"><thead><tr><th>Organisation</th><th>Category</th><th>Annual (R)</th><th>Renewal Due</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
  list.forEach(function(m){
    var status=m.due?(isExpired(m.due)?'<span class="biz-badge biz-badge-red">Expired</span>':'<span class="biz-badge biz-badge-green">Active</span>'):'<span class="biz-badge">Unknown</span>';
    html+='<tr><td><b>'+esc(m.org||'—')+'</b><br><small>'+esc(m.name||'')+'</small></td><td>'+esc(m.cat||'—')+'</td>'
      +'<td>'+fmt(m.annual||0)+'</td><td>'+(m.due||'—')+'</td><td>'+status+'</td>'
      +'<td><button class="biz-btn" onclick="memEdit(\''+m.id+'\')">Edit</button></td></tr>';
  });
  el.innerHTML=html+'</tbody></table>';
}
function memLoadDefaults(){
  MEMBERSHIP_DEFAULTS.forEach(function(d){
    var id='MEM-'+d.org.replace(/[^A-Z0-9]/gi,'-').toUpperCase();
    if(!bizGet('mem_'+id)){bizSet('mem_'+id,Object.assign({id:id},d,{ts:Date.now()}));}
  });
  memRender();
}
function memNew(){memEdit(null);}
function memEdit(id){
  var m=id?bizGet('mem_'+id):{};
  var html='<div class="biz-modal-bg" id="mem-modal">'
    +'<div class="biz-modal">'
    +'<h3>'+(id?'Edit':'New')+' Membership / Licence</h3>'
    +'<label>Organisation Abbreviation<input id="mm-org" value="'+esc(m.org||'')+'"></label>'
    +'<label>Full Name<input id="mm-name" value="'+esc(m.name||'')+'"></label>'
    +'<label>Category<input id="mm-cat" value="'+esc(m.cat||'')+'"></label>'
    +'<label>Annual Fee (R)<input type="number" id="mm-ann" value="'+(m.annual||0)+'" min="0"></label>'
    +'<label>Renewal Due Date<input type="date" id="mm-due" value="'+(m.due||'')+'"></label>'
    +'<label>Member # / Reg #<input id="mm-memno" value="'+esc(m.memNo||'')+'"></label>'
    +'<label>Notes<input id="mm-notes" value="'+esc(m.notes||'')+'"></label>'
    +'<div class="biz-modal-actions">'
    +'<button class="biz-btn biz-btn-primary" onclick="memSave(\''+id+'\')">Save</button> '
    +'<button class="biz-btn" onclick="closeModal(\'mem-modal\')">Cancel</button>'
    +(id?'<button class="biz-btn biz-btn-danger" style="float:right" onclick="bizDel(\'mem_'+id+'\');closeModal(\'mem-modal\');memRender()">Delete</button>':'')
    +'</div></div></div>';
  document.body.insertAdjacentHTML('beforeend',html);
  var _m=document.body.lastElementChild;if(_m&&_m.classList.contains('biz-modal-bg'))_m.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function memSave(id){
  var saved=id?bizGet('mem_'+id):{};
  var newId=id||('MEM-'+Date.now());
  Object.assign(saved,{org:val('mm-org'),name:val('mm-name'),cat:val('mm-cat'),
    annual:parseFloat(val('mm-ann'))||0,due:val('mm-due'),memNo:val('mm-memno'),notes:val('mm-notes'),ts:Date.now()});
  if(!id){saved.id=newId;}
  bizSet('mem_'+(id||newId),saved);
  closeModal('mem-modal');memRender();
}


/* — Agreements (Employee Contracts, Subcontractor SLA, MOU, NDA) —
   NOTE: Works Agreement (AGR) implementation is defined earlier in this file.
   The old stub below has been removed to avoid duplicate function conflicts.
   ——————————————————————————————————————————————————————————————————————— */
function _agrRenderOldStub_DISABLED(){
  var typeFilter=(document.getElementById('agr-type-filter')||{}).value||'';
  var list=bizList('agr');list.sort(function(a,b){return b.ts-a.ts;});
  if(typeFilter) list=list.filter(function(a){return a.agrType===typeFilter;});
  var el=document.getElementById('agr-list');if(!el)return;
  if(!list.length){
    el.innerHTML='<p style="color:var(--muted)">No agreements yet. Click <b>+ New Agreement</b> to add an employee contract, subcontractor SLA, MOU or NDA.</p>';
    return;
  }
  var html='<table class="biz-table"><thead><tr><th>Ref #</th><th>Type</th><th>Party</th><th>Effective Date</th><th>Expiry</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
  list.forEach(function(a){
    var exp=a.expiry?a.expiry:'Open-ended';
    var today=new Date().toISOString().split('T')[0];
    var status=a.expiry&&a.expiry<today?'<span style="color:#c62828;font-weight:700">Expired</span>':'<span style="color:#2e7d32;font-weight:700">Active</span>';
    html+='<tr><td><b>'+esc(a.agrNo||'—')+'</b></td><td>'+esc(a.agrType||'—')+'</td><td>'+esc(a.party||'—')+'</td>'
      +'<td>'+(a.effective||'—')+'</td><td>'+esc(exp)+'</td><td>'+status+'</td>'
      +'<td><button class="biz-btn" onclick="agrEdit(\''+a.id+'\')">Edit</button> '
      +'<button class="biz-btn biz-btn-secondary" onclick="agrPrint(\''+a.id+'\')">Print</button> '
      +'<button class="biz-btn biz-btn-danger" onclick="bizDel(\'agr_'+a.id+'\');agrRender()">✕</button></td></tr>';
  });
  el.innerHTML=html+'</tbody></table>';
}
function _agrNewOldStub_DISABLED(){_agrEditOldStub_DISABLED(null);}
function _agrEditOldStub_DISABLED(id){
  var a=id?bizGet('agr_'+id):{};
  var agrNo=a.agrNo||'AGR-'+(Date.now()+'').slice(-5);
  var types=['Employee Contract','Subcontractor SLA','MOU','NDA','Other'];
  var html='<div class="biz-modal-bg" id="agr-modal"><div class="biz-modal" style="max-width:640px">'
    +'<h3>Agreement — '+agrNo+'</h3>'
    +'<label>Type *<select id="am-type">'
    +types.map(function(t){return '<option'+(a.agrType===t?' selected':'')+'>'+t+'</option>';}).join('')
    +'</select></label>'
    +'<label>Party / Name *<input id="am-party" value="'+esc(a.party||'')+'" placeholder="Employee or company name"></label>'
    +'<label>ID / Reg No<input id="am-idno" value="'+esc(a.idno||'')+'" placeholder="ID number or company reg"></label>'
    +'<label>Effective Date<input type="date" id="am-eff" value="'+(a.effective||'')+'"></label>'
    +'<label>Expiry Date (leave blank for open-ended)<input type="date" id="am-exp" value="'+(a.expiry||'')+'"></label>'
    +'<label>Key Terms / Summary<textarea id="am-terms" rows="5" placeholder="Summarise key terms, deliverables, obligations...">'+esc(a.terms||'')+'</textarea></label>'
    +'<label>Remuneration / Value (R)<input type="number" id="am-value" value="'+(a.value||'')+'" placeholder="e.g. 15000"></label>'
    +'<label>Notes<textarea id="am-notes" rows="2">'+esc(a.notes||'')+'</textarea></label>'
    +'<label>Status<select id="am-status">'
    +['Draft','Active','Signed','Expired','Terminated'].map(function(s){return '<option'+(a.status===s?' selected':'')+'>'+s+'</option>';}).join('')
    +'</select></label>'
    +'<div class="biz-modal-actions">'
    +'<button class="biz-btn biz-btn-primary" onclick="agrSave(\''+agrNo+'\',\''+(id||'')+'\')">Save</button> '
    +'<button class="biz-btn" onclick="closeModal(\'agr-modal\')">Cancel</button>'
    +(id?'<button class="biz-btn biz-btn-danger" style="float:right" onclick="bizDel(\'agr_'+id+'\');closeModal(\'agr-modal\');agrRender()">Delete</button>':'')
    +'</div></div></div>';
  var old=document.getElementById('agr-modal');if(old)old.remove();
  document.body.insertAdjacentHTML('beforeend',html);
  var _m=document.body.lastElementChild;if(_m&&_m.classList.contains('biz-modal-bg'))_m.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function _agrSaveOldStub_DISABLED(agrNo,existingId){
  var id=existingId||agrNo;
  var saved=existingId?bizGet('agr_'+existingId):{};
  Object.assign(saved,{agrNo:agrNo,id:id,agrType:val('am-type'),party:val('am-party'),idno:val('am-idno'),
    effective:val('am-eff'),expiry:val('am-exp'),terms:val('am-terms'),
    value:parseFloat(val('am-value'))||0,notes:val('am-notes'),status:val('am-status'),ts:Date.now()});
  bizSet('agr_'+id,saved);closeModal('agr-modal');agrRender();
}
function _agrPrintOldStub_DISABLED(id){
  var a=bizGet('agr_'+id);if(!a)return;
  var co=getCompany();
  var html='<div style="font-family:Arial,sans-serif;padding:36px;color:#222;max-width:800px;margin:0 auto">'
    +'<div style="display:flex;justify-content:space-between;border-bottom:2px solid #1a237e;padding-bottom:10px;margin-bottom:16px">'
    +'<div><div style="font-size:18px;font-weight:700;color:#1a237e">'+esc(co.name||'Riba T Tseke')+'</div>'
    +'<div style="font-size:11px;color:#666">'+esc(co.reg||'')+(co.reg?' · ':'')+esc(co.phone||'')+'</div></div>'
    +'<div style="text-align:right"><div style="font-size:13px;font-weight:700;letter-spacing:.05em;color:#1a237e">'+esc((a.agrType||'AGREEMENT').toUpperCase())+'</div>'
    +'<div style="font-size:14px;font-weight:700">'+esc(a.agrNo||'')+'</div>'
    +'<div style="font-size:11px;color:#666">Status: '+esc(a.status||'—')+'</div></div></div>'
    +'<table style="width:100%;border-collapse:collapse;margin-bottom:16px">'
    +'<tr><td style="padding:6px 8px;border:1px solid #ddd;width:40%"><b>Party / Name</b></td><td style="padding:6px 8px;border:1px solid #ddd">'+esc(a.party||'—')+'</td></tr>'
    +'<tr><td style="padding:6px 8px;border:1px solid #ddd"><b>ID / Reg No</b></td><td style="padding:6px 8px;border:1px solid #ddd">'+esc(a.idno||'—')+'</td></tr>'
    +'<tr><td style="padding:6px 8px;border:1px solid #ddd"><b>Effective Date</b></td><td style="padding:6px 8px;border:1px solid #ddd">'+(a.effective||'—')+'</td></tr>'
    +'<tr><td style="padding:6px 8px;border:1px solid #ddd"><b>Expiry Date</b></td><td style="padding:6px 8px;border:1px solid #ddd">'+(a.expiry||'Open-ended')+'</td></tr>'
    +'<tr><td style="padding:6px 8px;border:1px solid #ddd"><b>Remuneration / Value</b></td><td style="padding:6px 8px;border:1px solid #ddd">R'+(a.value||0).toFixed(2)+'</td></tr>'
    +'</table>'
    +'<h3 style="font-size:14px;border-bottom:1px solid #ddd;padding-bottom:4px">Key Terms &amp; Summary</h3>'
    +'<p style="line-height:1.8;white-space:pre-wrap">'+esc(a.terms||'—')+'</p>'
    +(a.notes?'<p><b>Notes:</b> '+esc(a.notes)+'</p>':'')
    +'<br><table style="width:100%;border-collapse:collapse;margin-top:24px"><thead>'
    +'<tr><th style="border:1px solid #ccc;padding:8px;background:#f5f5f5">'+esc(co.name||'Company')+'</th>'
    +'<th style="border:1px solid #ccc;padding:8px;background:#f5f5f5">'+esc(a.party||'Party')+'</th></tr></thead>'
    +'<tbody><tr><td style="border:1px solid #ccc;padding:8px;height:70px">Signature: _______________<br>Name: _______________<br>Date: _______________</td>'
    +'<td style="border:1px solid #ccc;padding:8px;height:70px">Signature: _______________<br>Name: _______________<br>Date: _______________</td></tr></tbody></table>'
    +'</div>';
  doPrintDoc(html,a.agrNo+' — '+esc(a.agrType||'Agreement'));
}

/* ═══════════════════════════════════════════════════════════
   SOPs
   ═══════════════════════════════════════════════════════════ */
var SOP_DEFAULTS=[
  {id:'SOP-001',sopNo:'SOP-001',category:'compliance',title:'CoC Issuance Procedure',version:'1.1',
    desc:'Standard operating procedure for issuing a Certificate of Compliance (CoC) for electrical installations under SANS 10142-1.',
    steps:'1. Receive client request or job card; confirm site address and client details.\n2. Review any previous CoC or inspection history for the property.\n3. Conduct visual inspection: DB labelling, wiring condition, earthing, cable management.\n4. Perform electrical tests per SANS 10142-1:\n   a. Insulation resistance — each circuit ≥1 MΩ at 500V DC\n   b. Continuity of protective conductors\n   c. RCD trip time — 30 mA type ≤300 ms\n   d. Earth loop impedance (where applicable)\n5. Record ALL test results on the Test Record form with instrument serial and cal date.\n6. Identify and document any defects; photograph non-conformances.\n7. If installation PASSES: complete CoC form — client name, site address, installation description, expiry date (not more than 2 years for general; on change of occupancy).\n8. If installation FAILS: issue Defect Notice. Schedule re-inspection after repairs.\n9. Obtain signatures: inspector (and ECA(SA) member stamp) and client/owner.\n10. File signed original in the job folder; email PDF copy to client.\n11. Update CoC Register in the admin system (Business Hub → Test Records).\n12. Notify client of expiry date and recommend calendar reminder.',
    ecsa:'10 - Take responsibility for decisions',
    raci:JSON.stringify([
      {step:'1. Receive request & confirm details',r:'Inspector',a:'Director',c:'Client',i:'Admin'},
      {step:'2. Visual inspection',r:'Inspector',a:'Inspector',c:'—',i:'Director'},
      {step:'3. Electrical tests',r:'Inspector',a:'Inspector',c:'—',i:'Director'},
      {step:'4. Record test results',r:'Inspector',a:'Inspector',c:'—',i:'Admin'},
      {step:'5. Issue CoC / Defect Notice',r:'Inspector',a:'Director',c:'Client',i:'Admin'},
      {step:'6. Update CoC Register',r:'Admin',a:'Director',c:'—',i:'Inspector'}
    ])},
  {id:'SOP-002',sopNo:'SOP-002',category:'technical',title:'PV System Commissioning',version:'1.1',
    desc:'Procedure for commissioning a grid-tied or off-grid photovoltaic (PV) solar installation.',
    steps:'1. Verify PV array installation: panel orientation, tilt angle, shading assessment.\n2. Inspect all DC wiring: MC4 connectors, cable sizing, fusing, surge protection devices.\n3. Verify AC inverter wiring, isolators, and anti-islanding protection settings.\n4. Test each string with open circuits: Voc, Isc, insulation resistance per string (≥1 MΩ).\n5. Measure and record string polarity before connecting to inverter.\n6. Commission inverter: set grid parameters (220 V / 50 Hz), verify feed-in limits (if grid-tied).\n7. Monitor inverter display for fault codes; test anti-islanding protection relay.\n8. Complete PV Test Record with all measurements — log under Business Hub → Test Records.\n9. Issue CoC for AC wiring portion under SANS 10142-1.\n10. Provide handover documentation: system manual, warranty cards, monitoring app setup.\n11. Train client on basic operation, shutdown procedure, and fault identification.',
    ecsa:'2 - Design or develop solutions',
    raci:JSON.stringify([
      {step:'1–3. Installation inspection',r:'Inspector',a:'Director',c:'Client',i:'Admin'},
      {step:'4–5. String tests',r:'Inspector',a:'Inspector',c:'—',i:'Director'},
      {step:'6–7. Inverter commissioning',r:'Inspector',a:'Inspector',c:'Manufacturer',i:'Director'},
      {step:'8. PV Test Record',r:'Inspector',a:'Director',c:'—',i:'Admin'},
      {step:'9. CoC issuance',r:'Inspector',a:'Director',c:'Client',i:'Admin'},
      {step:'10–11. Handover & training',r:'Director',a:'Director',c:'Inspector',i:'Client'}
    ])},
  {id:'SOP-003',sopNo:'SOP-003',category:'technical',title:'DB (Distribution Board) Inspection',version:'1.1',
    desc:'Procedure for inspecting and testing a main or sub-distribution board per SANS 10142-1.',
    steps:'1. Confirm isolation: switch off main breaker; apply LOTO (lock out / tag out).\n2. Remove DB cover safely; inspect for moisture, corrosion, pest ingress, overheating.\n3. Verify all breakers are correctly rated, labelled, and not bypassed.\n4. Check earthing and neutral bar connections; torque check on ALL terminals.\n5. Inspect cable entry points and gland sizes vs. cable diameter.\n6. Test all RCDs: press test button; verify 30 mA RCDs trip ≤300 ms with test instrument.\n7. Measure insulation resistance on each outgoing circuit (≥1 MΩ at 500V DC).\n8. Check earth leakage current on main supply (must be below RCD trip threshold).\n9. Document all readings on Test Record form; note instrument serial and calibration date.\n10. Reinstate supply; monitor for abnormal current draw or heat.\n11. Issue defect notice for any non-conformance; schedule re-test after repair.',
    ecsa:'1 - Define, investigate and analyse',
    raci:JSON.stringify([
      {step:'1. LOTO isolation',r:'Inspector',a:'Inspector',c:'Client',i:'Director'},
      {step:'2–5. Visual inspection',r:'Inspector',a:'Inspector',c:'—',i:'Director'},
      {step:'6–8. Electrical tests',r:'Inspector',a:'Inspector',c:'—',i:'Director'},
      {step:'9. Record results',r:'Inspector',a:'Inspector',c:'—',i:'Admin'},
      {step:'10–11. Reinstate & close',r:'Inspector',a:'Director',c:'Client',i:'Admin'}
    ])},
  {id:'SOP-004',sopNo:'SOP-004',category:'technical',title:'GitHub Version Control Workflow',version:'1.0',
    desc:'Standard workflow for managing source code using GitHub — branching, commits, pull requests, and releases for the ribattseke.co.za project.',
    steps:'1. REPOSITORY SETUP\n   - Main repo: ribattseke-site (private, GitHub)\n   - Main branch = production; dev branch = development\n   - Never commit directly to main without review.\n\n2. DAILY WORKFLOW\n   a. Pull latest from main: git pull origin main\n   b. Create a feature/fix branch: git checkout -b fix/description\n   c. Make changes in VS Code or directly on the index.html\n   d. Stage and commit: git add index.html && git commit -m "fix: short description"\n   e. Push branch: git push origin fix/description\n\n3. COMMIT MESSAGE CONVENTIONS\n   - feat: new feature\n   - fix: bug fix\n   - content: text/data update\n   - deploy: production release\n   - Use present tense. Keep under 72 chars.\n\n4. PULL REQUESTS\n   a. Open PR on GitHub: fix/description → main\n   b. Describe what changed and why\n   c. Self-review: check diff for accidental deletions or exposed secrets\n   d. Merge via "Squash and merge"\n   e. Delete merged branch\n\n5. RELEASE TAGGING\n   - Tag production releases: git tag -a v1.x.x -m "Release notes"\n   - Push tag: git push origin --tags\n\n6. SECRETS & SECURITY\n   - NEVER commit API keys, Firebase config, or admin PINs to the repo\n   - Store secrets in Cloudflare environment variables or in a separate .env file listed in .gitignore\n   - Rotate keys immediately if accidentally exposed\n\n7. BACKUP\n   - GitHub serves as the primary backup\n   - Download a local ZIP copy after each major release\n   - Keep one copy on Google Drive (Business Hub → Files)',
    ecsa:'3 - Apply established engineering practice',
    raci:JSON.stringify([
      {step:'Create branch & commit',r:'Developer',a:'Director',c:'—',i:'Admin'},
      {step:'Review pull request',r:'Director',a:'Director',c:'Developer',i:'Admin'},
      {step:'Merge to main',r:'Director',a:'Director',c:'—',i:'Admin'},
      {step:'Tag release',r:'Director',a:'Director',c:'—',i:'Admin'},
      {step:'Check for exposed secrets',r:'Developer',a:'Director',c:'—',i:'Admin'}
    ])},
  {id:'SOP-005',sopNo:'SOP-005',category:'technical',title:'Firebase / Firestore Database Management',version:'1.0',
    desc:'Procedure for managing Firebase Firestore collections, security rules, and user data for the LMS platform.',
    steps:'1. FIREBASE PROJECT\n   - Project: ribattseke-lms (Firebase Console)\n   - Collections: users, keys, activity, invoices\n   - Authentication: Email/Password and anonymous\n\n2. ADDING / UPDATING RECORDS\n   a. Access Firebase Console → Firestore Database\n   b. Navigate to the relevant collection\n   c. Add or edit documents using the console UI or via Admin SDK scripts\n   d. NEVER manually edit user payment or access records without an audit trail\n\n3. COHORT KEY MANAGEMENT\n   - Keys are stored in collection: keys\n   - Africa TVET cohort keys: prefix ATVET- or AFRICA-\n   - To add a batch of keys: use the Admin panel → Keys section in the LMS\n   - Set maxUses and expiry fields appropriately\n\n4. SECURITY RULES\n   - Rules are in Firebase Console → Firestore → Rules\n   - Default rule: authenticated users can read their own document only\n   - Admin writes are done via service account (server-side) only\n   - Review rules quarterly; never open read/write to all\n\n5. BACKUPS\n   a. Export Firestore data monthly: Firebase Console → Firestore → Import/Export\n   b. Store exports in Google Cloud Storage bucket (ribattseke-backups)\n   c. Test restore procedure every 6 months\n\n6. MONITORING\n   - Firebase Console → Usage and Billing: check quota monthly\n   - Alert threshold: 70% of free-tier limit → upgrade to Blaze plan\n   - Activity logs: check for unusual authentication or write spikes\n\n7. INCIDENT RESPONSE\n   - Suspected data breach: immediately disable authentication in Firebase Console\n   - Notify affected users within 72 hours (POPIA requirement)\n   - Document incident in HSE / Risk Register',
    ecsa:'7 - Meet legal and safety requirements',
    raci:JSON.stringify([
      {step:'Add cohort keys',r:'Admin',a:'Director',c:'—',i:'Students'},
      {step:'Edit user records',r:'Director',a:'Director',c:'—',i:'Admin'},
      {step:'Review security rules',r:'Director',a:'Director',c:'—',i:'Admin'},
      {step:'Monthly backup',r:'Admin',a:'Director',c:'—',i:'Director'},
      {step:'Incident response',r:'Director',a:'Director',c:'Legal',i:'Users'}
    ])},
  {id:'SOP-006',sopNo:'SOP-006',category:'hse',title:'Claude AI Usage Policy',version:'1.0',
    desc:'Guidelines for using Claude AI (Anthropic) in business operations, content creation, and site development for Riba T Tseke.',
    steps:'1. APPROVED USES\n   - Website development and debugging (index.html edits)\n   - Drafting client communications and proposals\n   - Generating quiz questions and study content for the LMS\n   - Research and summarising technical standards (SANS, IEC)\n   - SOP and report drafting (always human-reviewed before finalising)\n\n2. PROHIBITED USES\n   - Submitting Claude-generated content as ECSA CPD evidence without disclosure\n   - Sharing confidential client data, ID numbers, or financial records with Claude\n   - Using Claude to generate false certifications, qualifications, or regulatory submissions\n   - Relying solely on Claude for legal or financial advice\n\n3. WORKFLOW\n   a. Session: start a new Claude session for each distinct task\n   b. Context: paste only the minimum required context (no full client databases)\n   c. Review: ALL Claude outputs must be reviewed and approved by the Director before use\n   d. Version: note which Claude model was used for significant deliverables\n\n4. DATA PRIVACY (POPIA)\n   - Do not paste personal information (ID numbers, banking details, medical info) into Claude\n   - Anonymise data before using it as AI context (e.g., "Client A" instead of full name)\n   - Delete conversation history after sensitive sessions\n\n5. COST MANAGEMENT\n   - Monitor Claude.ai subscription usage monthly\n   - For large batch tasks (e.g., generating 100 quiz questions), use the API with token limits\n   - Log significant AI-assisted projects in the Business Hub notes\n\n6. QUALITY CONTROL\n   - Cross-check technical content against official SANS standards\n   - Have a qualified person verify all electrical engineering calculations\n   - Do not publish AI-generated exam questions without expert review',
    ecsa:'8 - Conduct work ethically',
    raci:JSON.stringify([
      {step:'Draft content with Claude',r:'Director',a:'Director',c:'—',i:'Admin'},
      {step:'Review AI output',r:'Director',a:'Director',c:'Subject Expert',i:'Admin'},
      {step:'Publish to website/LMS',r:'Admin',a:'Director',c:'Director',i:'Students'},
      {step:'Data privacy check',r:'Director',a:'Director',c:'—',i:'Admin'},
      {step:'Monthly usage review',r:'Admin',a:'Director',c:'—',i:'Director'}
    ])},
  {id:'SOP-007',sopNo:'SOP-007',category:'technical',title:'Domain & Website Management (ribattseke.co.za)',version:'1.0',
    desc:'Procedure for managing the ribattseke.co.za domain, DNS, Cloudflare CDN, and website deployments.',
    steps:'1. DOMAIN DETAILS\n   - Domain: ribattseke.co.za\n   - Registrar: (confirm in Cloudflare or Domains panel)\n   - DNS managed by: Cloudflare\n   - Hosting: Cloudflare Pages (static site deployment)\n\n2. DNS MANAGEMENT\n   a. Log in to Cloudflare Dashboard → ribattseke.co.za\n   b. DNS records: A record and CNAME for www must point to Cloudflare Pages\n   c. MX records: check if email forwarding is configured\n   d. Any DNS change takes effect within 5 minutes on Cloudflare (orange cloud = proxied)\n   e. Document all DNS changes with date, reason, and who made the change\n\n3. WEBSITE DEPLOYMENT\n   a. Download updated index.html from Claude session\n   b. Log in to Cloudflare Pages Dashboard\n   c. Select project: ribattseke-site (or the correct project name)\n   d. Upload the new index.html via the Dashboard upload OR use:\n      wrangler pages publish . --project-name=ribattseke-site\n   e. Verify deployment at https://ribattseke.co.za after ~1 min\n   f. Test: LMS login, admin panel, quotes, print functions\n   g. If anything is broken: Cloudflare Pages → Deployments → Roll back to previous\n\n4. SSL / HTTPS\n   - SSL is automatic via Cloudflare Universal SSL (always ON)\n   - Minimum TLS version: 1.2\n   - HSTS: enabled\n   - If SSL error appears: check nameserver delegation and Cloudflare proxy status\n\n5. DOMAIN RENEWAL\n   - Set domain auto-renewal ON in the registrar\n   - Calendar reminder: 60 days before expiry\n   - Domain expiry date: check annually and log in Business Hub → Notes\n\n6. SECURITY\n   - Cloudflare WAF: basic protection ON\n   - Rate limiting: enabled on /api/* if any server-side routes are added\n   - Page Rules: redirect HTTP to HTTPS (always on)\n   - If site is defaced or hacked: roll back deployment immediately; change all passwords',
    ecsa:'7 - Meet legal and safety requirements',
    raci:JSON.stringify([
      {step:'DNS change',r:'Director',a:'Director',c:'—',i:'Admin'},
      {step:'Website deployment',r:'Director',a:'Director',c:'—',i:'Admin'},
      {step:'Post-deploy testing',r:'Admin',a:'Director',c:'Director',i:'—'},
      {step:'Rollback',r:'Director',a:'Director',c:'—',i:'Admin'},
      {step:'Domain renewal',r:'Admin',a:'Director',c:'—',i:'Director'}
    ])},
  {id:'SOP-008',sopNo:'SOP-008',category:'hse',title:'Quoting and Proposal Process',version:'1.0',
    desc:'Standard procedure for preparing, issuing, and following up on client quotations.',
    steps:'1. INTAKE\n   a. Receive client enquiry (WhatsApp, phone, email, or walk-in)\n   b. Conduct site visit or telephone assessment; take photos\n   c. Confirm scope: installation type, cable runs, DB size, special requirements\n\n2. PREPARE QUOTATION\n   a. Open Business Hub → Quotes → + New Quote\n   b. Select or create client record\n   c. Add line items: labour, materials, sundries, travel (if applicable)\n   d. Apply applicable markup and VAT (if VAT-registered; confirm current status)\n   e. Add payment terms: 50% deposit, balance on completion\n   f. Add validity period: 30 days from issue date\n   g. Add any special conditions (site access, client-supplied materials)\n\n3. ISSUE QUOTATION\n   a. Print or export quote PDF from Business Hub\n   b. Send to client via WhatsApp or email with a brief cover message\n   c. Follow up within 3 business days if no response\n\n4. ACCEPTANCE\n   a. Record client acceptance (signed quote or written confirmation)\n   b. Convert quote to job card\n   c. Schedule work date in calendar\n   d. Collect deposit before starting work\n\n5. VARIATIONS\n   - Any change to scope must be agreed in writing before the work is done\n   - Issue a Variation Order (VO) or revised quote for cost changes ≥10%\n\n6. REJECTION\n   - Log reason for rejection in the quote record (price, timing, competitor)\n   - Follow up after 2 weeks if circumstances may have changed',
    ecsa:'5 - Communicate and collaborate',
    raci:JSON.stringify([
      {step:'Site visit / assessment',r:'Director',a:'Director',c:'Client',i:'Admin'},
      {step:'Prepare quote',r:'Director',a:'Director',c:'—',i:'Admin'},
      {step:'Issue quote to client',r:'Admin',a:'Director',c:'Director',i:'Client'},
      {step:'Follow up',r:'Admin',a:'Director',c:'Director',i:'Client'},
      {step:'Accept & schedule',r:'Director',a:'Director',c:'Client',i:'Admin'}
    ])},
  {id:'SOP-009',sopNo:'SOP-009',category:'hse',title:'Invoicing and Payment Process',version:'1.0',
    desc:'Standard procedure for issuing invoices, collecting payment, and reconciling accounts.',
    steps:'1. INVOICE PREPARATION\n   a. After job completion (or at deposit stage), open Business Hub → Invoices → + New Invoice\n   b. Link to accepted quotation; adjust line items for actual work done\n   c. Add payment terms: EFT details or SnapScan/PayShap\n   d. Set due date: 7 days from invoice date (or as agreed)\n   e. Verify VAT treatment (zero-rated / excluded if not VAT-registered)\n\n2. ISSUE INVOICE\n   a. Print or export invoice PDF\n   b. Send to client via WhatsApp or email\n   c. For deposits: issue a Pro-Forma invoice before work starts\n\n3. PAYMENT FOLLOW-UP\n   - Day 0: Invoice issued\n   - Day 7: Check if payment received\n   - Day 8: First follow-up — polite WhatsApp reminder\n   - Day 14: Second follow-up — formal email\n   - Day 21: Escalate — call and issue final demand letter\n   - Day 30+: Consider letter of demand or SMME tribunal process\n\n4. PROOF OF PAYMENT\n   a. When PoP received: verify in banking app that money has cleared\n   b. Update invoice status to "Paid" in Business Hub\n   c. Send receipt (stamped/signed invoice marked PAID)\n\n5. RECONCILIATION\n   a. Weekly: check Business Hub → Invoices for outstanding balances\n   b. Monthly: reconcile invoices against bank statement\n   c. Quarterly: review debtors list; write off irrecoverable amounts after escalation\n\n6. RECORD RETENTION\n   - Keep invoices and PoPs for minimum 5 years (SARS requirement)\n   - Store in Google Drive: Accounts / Invoices / YYYY',
    ecsa:'6 - Recognise effects of work',
    raci:JSON.stringify([
      {step:'Prepare invoice',r:'Director',a:'Director',c:'—',i:'Admin'},
      {step:'Issue invoice',r:'Admin',a:'Director',c:'Director',i:'Client'},
      {step:'Follow up on payment',r:'Admin',a:'Director',c:'Director',i:'Client'},
      {step:'Verify & receipt payment',r:'Director',a:'Director',c:'—',i:'Admin'},
      {step:'Monthly reconciliation',r:'Admin',a:'Director',c:'—',i:'Director'}
    ])},
  {id:'SOP-010',sopNo:'SOP-010',category:'compliance',title:'Electrical Test Record Procedure',version:'1.0',
    desc:'Procedure for completing and filing electrical installation test records per SANS 10142-1 and Construction Regulations.',
    steps:'1. PRE-TEST PREPARATION\n   a. Confirm test instrument calibration is current (annual calibration required)\n   b. Record instrument make, model, and serial number on test record form\n   c. Obtain installation drawings or single-line diagram\n   d. Confirm isolation procedure with client\n\n2. INSULATION RESISTANCE TESTS\n   a. Isolate all circuit breakers and disconnect sensitive equipment (dimmers, surge protectors, smart devices)\n   b. Apply 500V DC between line and earth, neutral and earth for each circuit\n   c. Minimum acceptable: 1 MΩ per circuit\n   d. Record individual circuit readings — not just a single composite reading\n\n3. CONTINUITY TESTS\n   a. Test CPC (circuit protective conductor) continuity on all circuits\n   b. Record resistance in Ω for each circuit\n   c. Acceptable: <1 Ω for most residential circuits\n\n4. RCD TESTS\n   a. Test all 30 mA RCDs with calibrated tester\n   b. Trip time must be ≤300 ms at rated trip current\n   c. Test at 50%, 100%, and 150% of rated trip current where instrument allows\n   d. Record trip time for each RCD\n\n5. COMPLETING THE RECORD\n   a. Complete test record form in full — no blank fields\n   b. Sign and date; include ECSA / ECA(SA) registration number\n   c. Have installation owner or representative sign as witness\n   d. Attach to CoC or store separately in job folder\n\n6. FILING\n   a. Upload scan or photo to Business Hub → Test Records\n   b. Cross-reference with the linked CoC record\n   c. Retain original paper record for minimum 2 years',
    ecsa:'1 - Define, investigate and analyse',
    raci:JSON.stringify([
      {step:'Pre-test preparation',r:'Inspector',a:'Inspector',c:'Client',i:'Director'},
      {step:'Insulation & continuity tests',r:'Inspector',a:'Inspector',c:'—',i:'Director'},
      {step:'RCD tests',r:'Inspector',a:'Inspector',c:'—',i:'Director'},
      {step:'Complete & sign test record',r:'Inspector',a:'Director',c:'Client',i:'Admin'},
      {step:'File in system',r:'Admin',a:'Director',c:'—',i:'Inspector'}
    ])}
];

var SOP_CATS={
  compliance:{label:'Compliance',color:'#1565C0',bg:'rgba(21,101,192,.1)',icon:'📋'},
  technical:{label:'Technical',color:'#2E7D32',bg:'rgba(46,125,50,.1)',icon:'🔧'},
  hse:{label:'Health, Safety & Environment',color:'#B71C1C',bg:'rgba(183,28,28,.1)',icon:'🦺'}
};
function sopRender(){
  var list=bizList('sop');list.sort(function(a,b){return a.sopNo>b.sopNo?1:-1;});
  var el=document.getElementById('sop-list');if(!el)return;
  if(!list.length){
    el.innerHTML='<p style="color:var(--muted)">No SOPs yet. '
      +'<button class="biz-btn" onclick="sopLoadDefaults()">Load default SOPs</button></p>';
    return;
  }
  var groups={compliance:[],technical:[],hse:[]};
  list.forEach(function(s){var c=s.category||'technical';if(!groups[c])groups[c]=[];groups[c].push(s);});
  var html='';
  ['compliance','technical','hse'].forEach(function(cat){
    var items=groups[cat];if(!items||!items.length)return;
    var cc=SOP_CATS[cat];
    html+='<div style="margin-bottom:20px">'
      +'<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:6px;background:'+cc.bg+';margin-bottom:8px">'
      +'<span style="font-size:16px">'+cc.icon+'</span>'
      +'<span style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:'+cc.color+'">'+cc.label+'</span>'
      +'<span style="margin-left:auto;font-size:11px;color:var(--muted)">'+items.length+' document'+(items.length>1?'s':'')+'</span>'
      +'</div>'
      +'<table class="biz-table" style="margin:0"><thead><tr><th>SOP #</th><th>Title</th><th>Version</th><th>ECSA Outcome</th><th>Actions</th></tr></thead><tbody>';
    items.forEach(function(s){
      html+='<tr><td><b>'+s.sopNo+'</b></td><td>'+esc(s.title||'—')+'</td><td>'+esc(s.version||'1.0')+'</td>'
        +'<td>'+esc(s.ecsa||'—')+'</td>'
        +'<td><button class="biz-btn" onclick="sopEdit(\''+s.id+'\')">Edit</button> '
        +'<button class="biz-btn" onclick="sopPrint(\''+s.id+'\')">Print</button></td></tr>';
    });
    html+='</tbody></table></div>';
  });
  el.innerHTML=html;
}
function sopLoadDefaults(){
  SOP_DEFAULTS.forEach(function(s){if(!bizGet('sop_'+s.id)){bizSet('sop_'+s.id,Object.assign({ts:Date.now()},s));}});
  sopRender();
}
function sopNew(){
  var seq=bizSeq('sop');var sopNo='SOP-'+String(seq+3).padStart(3,'0');
  var obj={id:sopNo,sopNo:sopNo,category:'compliance',title:'',version:'1.0',desc:'',steps:'',ecsa:'',ts:Date.now()};
  bizSet('sop_'+sopNo,obj);sopEdit(sopNo);
}
function sopEdit(id){
  var s=bizGet('sop_'+id)||{};
  var html='<div class="biz-modal-bg" id="sop-modal">'
    +'<div class="biz-modal" style="max-width:640px">'
    +'<h3>SOP — '+s.sopNo+'</h3>'
    +'<label>Category<select id="sm-cat">'
    +'<option value="compliance"'+(s.category==='compliance'?' selected':'')+'>📋 Compliance</option>'
    +'<option value="technical"'+(!s.category||s.category==='technical'?' selected':'')+'>🔧 Technical</option>'
    +'<option value="hse"'+(s.category==='hse'?' selected':'')+'>🦺 Health, Safety &amp; Environment</option>'
    +'</select></label>'
    +'<label>Title *<input id="sm-title" value="'+esc(s.title||'')+'"></label>'
    +'<label>Version<input id="sm-ver" value="'+esc(s.version||'1.0')+'" style="width:80px"></label>'
    +'<label>Description<textarea id="sm-desc" rows="2">'+esc(s.desc||'')+'</textarea></label>'
    +'<label>Procedure Steps<textarea id="sm-steps" rows="10" style="font-family:monospace">'+esc(s.steps||'')+'</textarea></label>'
    +'<label>ECSA PN Outcome Supported<select id="sm-ecsa">'
      +(['None'].concat(ECSA_OUTCOMES.map(function(o){return o.no+' - '+o.label;}))).map(function(o){return '<option'+(s.ecsa===o?' selected':'')+'>'+o+'</option>';}).join('')
    +'</select></label>'
    +'<div class="biz-modal-actions">'
    +'<button class="biz-btn biz-btn-primary" onclick="sopSave(\''+id+'\')">Save</button> '
    +'<button class="biz-btn" onclick="closeModal(\'sop-modal\')">Cancel</button>'
    +'<button class="biz-btn biz-btn-danger" style="float:right" onclick="bizDel(\'sop_'+id+'\');closeModal(\'sop-modal\');sopRender()">Delete</button>'
    +'</div></div></div>';
  var old=document.getElementById('sop-modal');if(old)old.remove();
  document.body.insertAdjacentHTML('beforeend',html);
  var _m=document.body.lastElementChild;if(_m&&_m.classList.contains('biz-modal-bg'))_m.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function sopSave(id){
  var s=bizGet('sop_'+id)||{};
  s.category=val('sm-cat')||'technical';s.title=val('sm-title');s.version=val('sm-ver');s.desc=val('sm-desc');s.steps=val('sm-steps');s.ecsa=val('sm-ecsa');s.ts=Date.now();
  bizSet('sop_'+id,s);closeModal('sop-modal');sopRender();
}
function sopPrint(id){
  var s=bizGet('sop_'+id);if(!s)return;
  var co=getCompany();
  var stepsHtml=esc(s.steps||'—').replace(/\n/g,'<br>');
  var raciHtml='';
  if(s.raci){try{var r=JSON.parse(s.raci);raciHtml='<h3>RACI Matrix</h3><table style="width:100%;border-collapse:collapse"><thead><tr>'
    +'<th style="border:1px solid #ccc;padding:6px;background:#f5f5f5">Step</th>'
    +'<th style="border:1px solid #ccc;padding:6px;background:#f5f5f5">Responsible</th>'
    +'<th style="border:1px solid #ccc;padding:6px;background:#f5f5f5">Accountable</th>'
    +'<th style="border:1px solid #ccc;padding:6px;background:#f5f5f5">Consulted</th>'
    +'<th style="border:1px solid #ccc;padding:6px;background:#f5f5f5">Informed</th></tr></thead><tbody>'
    +r.map(function(row){return '<tr><td style="border:1px solid #ccc;padding:5px">'+esc(row.step||'')+'</td>'
      +'<td style="border:1px solid #ccc;padding:5px;text-align:center">'+esc(row.r||'')+'</td>'
      +'<td style="border:1px solid #ccc;padding:5px;text-align:center">'+esc(row.a||'')+'</td>'
      +'<td style="border:1px solid #ccc;padding:5px;text-align:center">'+esc(row.c||'')+'</td>'
      +'<td style="border:1px solid #ccc;padding:5px;text-align:center">'+esc(row.i||'')+'</td></tr>';}).join('')
    +'</tbody></table>';}catch(e){}}
  var html='<div style="font-family:Arial,sans-serif;padding:30px;color:#222;max-width:800px;margin:0 auto">'
    +'<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1a237e;padding-bottom:10px;margin-bottom:16px">'
    +'<div><div style="font-size:18px;font-weight:700;color:#1a237e">'+esc(co.name||'Riba T Tseke')+'</div>'
    +'<div style="font-size:11px;color:#666">'+esc(co.reg||'')+(co.reg&&co.phone?' · ':'')+esc(co.phone||'')+'</div></div>'
    +'<div style="text-align:right"><div style="font-size:13px;font-weight:700;letter-spacing:.05em;color:#1a237e">STANDARD OPERATING PROCEDURE</div>'
    +'<div style="font-size:14px;font-weight:700">'+s.sopNo+' &nbsp;|&nbsp; v'+esc(s.version||'1.0')+'</div></div></div>'
    +'<h2 style="margin:0 0 8px;font-size:18px;color:#1a237e">'+esc(s.title||'Untitled SOP')+'</h2>'
    +'<div style="background:#f4f6fa;border-left:3px solid #1a237e;padding:10px 14px;border-radius:0 4px 4px 0;margin-bottom:14px">'
    +'<b>ECSA Outcome:</b> '+esc(s.ecsa||'—')+'<br><b>Description:</b> '+esc(s.desc||'—')+'</div>'
    +'<h3 style="font-size:14px;border-bottom:1px solid #ddd;padding-bottom:4px">Procedure Steps</h3>'
    +'<p style="line-height:1.8">'+stepsHtml+'</p>'
    +raciHtml
    +'<br><table style="width:100%;border-collapse:collapse"><tr>'
    +'<th style="border:1px solid #ccc;padding:8px;width:50%;background:#f5f5f5">Prepared By / Reviewed By</th>'
    +'<th style="border:1px solid #ccc;padding:8px;background:#f5f5f5">Approved By</th></tr>'
    +'<tr><td style="border:1px solid #ccc;padding:8px;height:60px">___________________<br>Date: __________</td>'
    +'<td style="border:1px solid #ccc;padding:8px">___________________<br>Date: __________</td></tr></table>'
    +'</div>';
  doPrintDoc(html,s.sopNo+' — '+esc(s.title||'SOP'));
}

/* ═══════════════════════════════════════════════════════════
   ECSA CPD TRACKER
   ═══════════════════════════════════════════════════════════ */
/* ECSA PN (Professional in Natural Sciences / Engineering) Outcomes — from ecsa.org.za R-02-STA */
var ECSA_OUTCOMES=[
  {no:1,label:'Define, investigate and analyse',desc:'Define, investigate and analyse well-defined engineering problems.'},
  {no:2,label:'Design or develop solutions',desc:'Design or develop solutions to well-defined problems within contextual constraints.'},
  {no:3,label:'Apply established engineering practice',desc:'Apply knowledge of established engineering practice specific to the jurisdiction.'},
  {no:4,label:'Manage engineering activities',desc:'Manage part or all of one or more well-defined engineering activities within a project.'},
  {no:5,label:'Communicate and collaborate',desc:'Communicate clearly and collaborate with stakeholders using appropriate methods.'},
  {no:6,label:'Recognise effects of work',desc:'Recognise and address the economic, social, cultural and environmental effects of the work.'},
  {no:7,label:'Meet legal and safety requirements',desc:'Meet legal and regulatory requirements and protect health and safety in engineering activities.'},
  {no:8,label:'Conduct work ethically',desc:'Conduct engineering activities ethically and in a professional manner.'},
  {no:9,label:'Exercise sound judgement',desc:'Exercise sound judgement on outcomes, impacts and alternatives in well-defined situations.'},
  {no:10,label:'Take responsibility for decisions',desc:'Take responsibility for decisions and work on part of well-defined engineering activities.'},
  {no:11,label:'Undertake professional development',desc:'Undertake professional development to remain current with developments in the field of engineering practice.'}
];
function ecsaRender(){
  ecsaSummary();
  var list=bizList('ecsa');list.sort(function(a,b){return b.ts-a.ts;});
  var el=document.getElementById('ecsa-log');if(!el)return;
  if(!list.length){el.innerHTML='<p style="color:var(--muted)">No CPD activities yet. Click <b>+ Log CPD Activity</b>.</p>';return;}
  var html='<table class="biz-table"><thead><tr><th>Date</th><th>Activity</th><th>Type</th><th>Hours</th><th>Outcomes</th><th>Actions</th></tr></thead><tbody>';
  list.forEach(function(e){
    html+='<tr><td>'+(e.date||'—')+'</td><td>'+esc(e.activity||'—')+'</td><td>'+esc(e.type||'—')+'</td>'
      +'<td>'+esc(e.hours||0)+'</td><td>'+esc(e.outcomes||'—')+'</td>'
      +'<td><button class="biz-btn" onclick="ecsaEdit(\''+e.id+'\')">Edit</button>'
      +'<button class="biz-btn biz-btn-danger" style="margin-left:4px" onclick="bizDel(\'ecsa_'+e.id+'\');ecsaRender()">✕</button></td></tr>';
  });
  el.innerHTML=html+'</tbody></table>';
}
function ecsaSummary(){
  var list=bizList('ecsa');
  var totalHours=list.reduce(function(a,e){return a+(parseFloat(e.hours)||0);},0);
  var byOutcome={};
  ECSA_OUTCOMES.forEach(function(o){byOutcome[o.no]=0;});
  list.forEach(function(e){
    (e.outcomes||'').split(',').forEach(function(o){
      var n=parseInt(o.trim());if(n>=1&&n<=11)byOutcome[n]=(byOutcome[n]||0)+(parseFloat(e.hours)||0);
    });
  });
  var el=document.getElementById('ecsa-summary');
  if(!el)return;
  var cards=ECSA_OUTCOMES.map(function(o){
    var h=byOutcome[o.no]||0;
    var pct=Math.min(100,Math.round((h/40)*100));
    return '<div class="ecsa-outcome-card">'
      +'<div style="font-weight:bold;font-size:13px">'+o.no+'. '+esc(o.label)+'</div>'
      +'<div style="font-size:11px;color:var(--muted)">'+esc(o.desc)+'</div>'
      +'<div style="margin-top:6px"><div style="height:6px;background:var(--border,#ddd);border-radius:3px"><div style="height:6px;background:#1a237e;border-radius:3px;width:'+pct+'%"></div></div>'
      +'<small>'+h+' hrs (target: 40)</small></div>'
      +'</div>';
  }).join('');
  el.innerHTML='<div style="margin-bottom:12px"><b>Total CPD Hours: '+totalHours+'</b></div>'
    +'<div class="ecsa-outcome-grid">'+cards+'</div>';
}
function ecsaNew(){ecsaEdit(null);}
function ecsaEdit(id){
  var e=id?bizGet('ecsa_'+id):{};
  var outChecks=ECSA_OUTCOMES.map(function(o){
    var checked=(e.outcomes||'').split(',').map(function(x){return x.trim();}).indexOf(String(o.no))>=0;
    return '<label style="display:flex;gap:6px;align-items:center;white-space:nowrap"><input type="checkbox" class="ecsa-chk" value="'+o.no+'" '+(checked?'checked':'')+'>'+o.no+'. '+esc(o.label)+'</label>';
  }).join('');
  var html='<div class="biz-modal-bg" id="ecsa-modal">'
    +'<div class="biz-modal" style="max-width:580px">'
    +'<h3>'+(id?'Edit':'Log')+' CPD Activity</h3>'
    +'<label>Activity Description *<input id="ea-act" value="'+esc(e.activity||'')+'"></label>'
    +'<label>Type<select id="ea-type">'
      +['Short Course','Seminar / Webinar','Conference','Workshop','In-house Training','Mentoring','Technical Reading','Project Work','Other'].map(function(t){return '<option'+(e.type===t?' selected':'')+'>'+t+'</option>';}).join('')
    +'</select></label>'
    +'<label>Date<input type="date" id="ea-date" value="'+(e.date||today())+'"></label>'
    +'<label>CPD Hours<input type="number" id="ea-hours" value="'+(e.hours||1)+'" min="0.5" step="0.5"></label>'
    +'<label>Provider / Organiser<input id="ea-prov" value="'+esc(e.provider||'')+'"></label>'
    +'<label>Certificate / Ref #<input id="ea-cert" value="'+esc(e.cert||'')+'"></label>'
    +'<fieldset style="margin:12px 0;padding:12px"><legend><b>ECSA Outcomes Covered</b></legend>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">'+outChecks+'</div>'
    +'</fieldset>'
    +'<div class="biz-modal-actions">'
    +'<button class="biz-btn biz-btn-primary" onclick="ecsaSave(\''+id+'\')">Save</button> '
    +'<button class="biz-btn" onclick="closeModal(\'ecsa-modal\')">Cancel</button>'
    +(id?'<button class="biz-btn biz-btn-danger" style="float:right" onclick="bizDel(\'ecsa_'+id+'\');closeModal(\'ecsa-modal\');ecsaRender()">Delete</button>':'')
    +'</div></div></div>';
  document.body.insertAdjacentHTML('beforeend',html);
  var _m=document.body.lastElementChild;if(_m&&_m.classList.contains('biz-modal-bg'))_m.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function ecsaSave(id){
  var act=val('ea-act').trim();if(!act){alert('Activity description required.');return;}
  var chks=document.querySelectorAll('.ecsa-chk:checked');
  var outcomes=Array.from(chks).map(function(c){return c.value;}).join(', ');
  var saved=id?bizGet('ecsa_'+id):{};
  var newId=id||('CPD-'+Date.now());
  Object.assign(saved,{activity:act,type:val('ea-type'),date:val('ea-date'),hours:parseFloat(val('ea-hours'))||1,
    provider:val('ea-prov'),cert:val('ea-cert'),outcomes:outcomes,id:saved.id||newId,ts:Date.now()});
  bizSet('ecsa_'+(id||newId),saved);
  closeModal('ecsa-modal');ecsaRender();
}
function ecsaPrint(){
  var list=bizList('ecsa');list.sort(function(a,b){return a.date>b.date?1:-1;});
  var co=getCompany();
  var totalHours=list.reduce(function(a,e){return a+(parseFloat(e.hours)||0);},0);
  var rows=list.map(function(e){
    return '<tr><td>'+e.date+'</td><td>'+esc(e.activity||'—')+'</td><td>'+esc(e.type||'—')+'</td>'
      +'<td>'+esc(e.hours||0)+'</td><td>'+esc(e.outcomes||'—')+'</td><td>'+esc(e.cert||'—')+'</td></tr>';
  }).join('');
  var w=window.open('','_blank','width=1000,height=800');
  w.document.write('<!DOCTYPE html><html><head><title>CPD Summary</title>'
    +'<style>body{font-family:Arial,sans-serif;margin:40px;color:#222}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:7px}th{background:#eee}</style></head><body>'
    +'<h2>'+esc(co.name||'Ribatt Electrical')+'</h2><h1>ECSA CPD ACTIVITY LOG</h1>'
    +'<p>Engineer: '+esc(bizGet('emp_EMP0001')?bizGet('emp_EMP0001').name:'Tseke Riba')+'</p>'
    +'<p>Total CPD Hours Logged: <b>'+totalHours+'</b></p>'
    +'<table><thead><tr><th>Date</th><th>Activity</th><th>Type</th><th>Hours</th><th>ECSA Outcomes</th><th>Cert/Ref</th></tr></thead><tbody>'
    +(rows||'<tr><td colspan="6">No activities logged</td></tr>')+'</tbody></table>'
    +'<h3>CPD Hours by Outcome</h3>'
    +'<table><thead><tr><th>#</th><th>Outcome</th><th>Hours</th></tr></thead><tbody>'
    +ECSA_OUTCOMES.map(function(o){
      var h=0;list.forEach(function(e){(e.outcomes||'').split(',').forEach(function(oc){if(parseInt(oc.trim())===o.no)h+=(parseFloat(e.hours)||0);});});
      return '<tr><td>'+o.no+'</td><td>'+esc(o.label)+'</td><td>'+h+'</td></tr>';
    }).join('')
    +'</tbody></table>'
    +'</body></html>');
  w.document.close();w.print();
}

/* ═══════════════════════════════════════════════════════════
   CLIENT LINKING & DEDUPLICATION
   New clients: website requests → auto onboarding
   Existing: search/manual add; always match by name/email/phone
   ═══════════════════════════════════════════════════════════ */
function cliFind(query){
  if(!query||query.length<2)return[];
  var q=query.toLowerCase();
  return bizList('cl_').filter(function(c){
    return (c.name||'').toLowerCase().indexOf(q)>=0
      ||(c.email||'').toLowerCase().indexOf(q)>=0
      ||(c.phone||'').replace(/\s/g,'').indexOf(q.replace(/\s/g,''))>=0;
  });
}
function cliFindDuplicate(name,email,phone){
  var all=bizList('cl_');
  var n=(name||'').toLowerCase().trim();
  var e=(email||'').toLowerCase().trim();
  var p=(phone||'').replace(/\D/g,'');
  return all.find(function(c){
    if(n&&(c.name||'').toLowerCase().trim()===n)return true;
    if(e&&e.length>3&&(c.email||'').toLowerCase().trim()===e)return true;
    if(p&&p.length>=9&&(c.phone||'').replace(/\D/g,'')===p)return true;
    return false;
  });
}
function cliOnboardFromWebsite(reqData){
  var dup=cliFindDuplicate(reqData.name,reqData.email,reqData.phone);
  if(dup){
    console.log('[ClientLink] Matched existing client:',dup.id,dup.name);
    return dup;
  }
  var seq=bizSeq('cli');
  var id='CLI-'+String(seq).padStart(4,'0');
  var obj={id:id,cliNo:id,name:reqData.name||'',email:reqData.email||'',phone:reqData.phone||'',
    address:reqData.address||'',source:'website',status:'Active',onboardedAt:new Date().toISOString(),ts:Date.now()};
  bizSet('cli_'+id,obj);
  console.log('[ClientLink] New client onboarded from website:',id,obj.name);
  return obj;
}

/* Client search widget used in modals — renders dropdown list */
function cliSearchWidget(inputId,resultId,onSelectFn){
  var inp=document.getElementById(inputId);
  var res=document.getElementById(resultId);
  if(!inp||!res)return;
  inp.addEventListener('input',function(){
    var q=inp.value;
    var found=cliFind(q);
    if(!found.length){res.innerHTML='';return;}
    res.innerHTML=found.slice(0,8).map(function(c){
      return '<div class="cli-search-item" onclick="('+onSelectFn+')(\''+c.id+'\',\''+esc(c.name)+'\');document.getElementById(\''+resultId+'\').innerHTML=\'\'">'
        +esc(c.name)+(c.email?' · '+esc(c.email):'')+' <small>'+(c.source||'manual')+'</small></div>';
    }).join('');
  });
}

/* ===== WHATSAPP MENTORING HUB ===== */
var MENTOR_NS = 'mentor_';
var MENTOR_WA = '27724748888'; // Tseke's WhatsApp for reference

// Weekly Installation Rules quiz questions bank
var MENTOR_QUIZ_BANK = [
  {
    id:'q1', week:1,
    question:'What is the minimum insulation resistance required for a completed electrical installation according to SANS 10142-1?',
    options:['A) 0.5 MΩ','B) 1 MΩ','C) 100 kΩ','D) 10 MΩ'],
    answer:'B) 1 MΩ',
    reference:'SANS 10142-1 Clause 8.6.2.1'
  },
  {
    id:'q2', week:2,
    question:'What colour is the earth conductor in a fixed installation in South Africa according to SANS 10142-1?',
    options:['A) Green','B) Yellow','C) Green/Yellow','D) Black'],
    answer:'C) Green/Yellow',
    reference:'SANS 10142-1 Clause 5.1.4'
  },
  {
    id:'q3', week:3,
    question:'What is the maximum loop impedance allowed for a 16 A Type B MCB to operate within 0.4 seconds?',
    options:['A) 2.87 Ω','B) 1.84 Ω','C) 0.86 Ω','D) 3.75 Ω'],
    answer:'A) 2.87 Ω',
    reference:'SANS 10142-1 Table 15'
  },
  {
    id:'q4', week:4,
    question:'According to SANS 10142-1, what is the maximum disconnection time for a 230 V TN system socket outlet circuit?',
    options:['A) 0.1 s','B) 0.2 s','C) 0.4 s','D) 5 s'],
    answer:'C) 0.4 s',
    reference:'SANS 10142-1 Clause 8.5.2'
  },
  {
    id:'q5', week:5,
    question:'What type of protection is required in a bathroom Zone 1 according to SANS 10142-1?',
    options:['A) IP20','B) IP44','C) IP55','D) IP67'],
    answer:'B) IP44',
    reference:'SANS 10142-1 Clause 7.5.5'
  },
  {
    id:'q6', week:6,
    question:'According to SANS 10142-1 Table 6.25, when the phase conductor is 25 mm², what is the minimum required cross-sectional area of the protective (earth) conductor?',
    options:['A) 2.5 mm²','B) 10 mm²','C) 25 mm²','D) 16 mm²'],
    answer:'D) 16 mm²',
    reference:'SANS 10142-1 Table 6.25 — 16 < S ≤ 35 mm² → PE = 16 mm² (25 mm² phase falls in this range)'
  },
  {
    id:'q7', week:7,
    question:'Which circuit arrangement ensures that a light fitting is controlled without the neutral being switched?',
    options:['A) Loop-in method','B) Switch-at-lampholder method','C) Junction box method','D) Conduit box method'],
    answer:'A) Loop-in method',
    reference:'SANS 10142-1 Clause 6.11'
  },
  {
    id:'q8', week:8,
    question:'What is the maximum number of socket outlets permitted on a single 20 A radial circuit in a domestic installation?',
    options:['A) 6','B) 8','C) 10','D) Unlimited, subject to load calculation'],
    answer:'D) Unlimited, subject to load calculation',
    reference:'SANS 10142-1 Clause 6.8.3'
  },
  {
    id:'q9', week:9,
    question:'In a TT earthing system, what device is typically required as the main protective measure against indirect contact?',
    options:['A) MCB','B) RCD (30 mA)','C) Fuse','D) Surge Protector'],
    answer:'B) RCD (30 mA)',
    reference:'SANS 10142-1 Clause 8.5.4'
  },
  {
    id:'q10', week:10,
    question:'What is the voltage band for a standard low-voltage supply in South Africa?',
    options:['A) 110 V ± 10%','B) 220 V ± 5%','C) 230 V +10%/-6%','D) 240 V ± 10%'],
    answer:'C) 230 V +10%/-6%',
    reference:'NRS 048-2'
  },
  {
    id:'q11', week:11,
    question:'Which SANS standard covers the earthing of low-voltage systems in South Africa?',
    options:['A) SANS 10142-1','B) SANS 10292','C) SANS 10198-1','D) SANS 10313'],
    answer:'B) SANS 10292',
    reference:'SANS 10292'
  },
  {
    id:'q12', week:12,
    question:'A COC must be issued by a person who holds a valid …',
    options:['A) Trade test certificate','B) Electrical installation work (EIW) registration','C) EWSETA assessor certificate','D) Wireman\'s licence'],
    answer:'B) Electrical installation work (EIW) registration',
    reference:'OHS Act Electrical Installation Regulations 7(1)'
  }
];

function mentorRender(){
  var listEl=document.getElementById('mentor-list');
  var statsEl=document.getElementById('mentor-stats');
  var quizEl=document.getElementById('mentor-quiz-bank');
  if(!listEl) return;

  // Build student list from LMS registrations
  var students=[];
  try{
    for(var i=0;i<localStorage.length;i++){
      var k=localStorage.key(i);
      if(k&&k.startsWith(LMS_NS)){
        var v=localStorage.getItem(k);
        if(!v) continue;
        var parts=k.replace(LMS_NS,'').split('_');
        if(parts.length<2) continue;
        var uname=parts.slice(0,-1).join('_');
        if(uname&&!students.find(function(s){return s.username===uname;})){
          var prog=null;
          try{prog=JSON.parse(v);}catch(e){}
          var phone='';
          try{
            var ph=localStorage.getItem(LMS_NS+'ph_'+uname);
            if(ph) phone=ph;
          }catch(e){}
          var lastContact=null;
          try{
            var lc=localStorage.getItem(MENTOR_NS+'last_'+uname);
            if(lc) lastContact=new Date(lc);
          }catch(e){}
          students.push({
            username:uname,
            phone:phone,
            tier:(prog&&prog.tier)||'pending',
            isAtvet:!!(prog&&prog.isAtvet),
            collegeId:(prog&&prog.collegeId)||'',
            lastContact:lastContact,
            quizsSent:parseInt(localStorage.getItem(MENTOR_NS+'quiz_'+uname)||'0',10),
            checkinsSent:parseInt(localStorage.getItem(MENTOR_NS+'checkin_'+uname)||'0',10)
          });
        }
      }
    }
  }catch(e){}

  // Stats row
  var total=students.length;
  var active=students.filter(function(s){return s.tier!=='pending';}).length;
  var atvet=students.filter(function(s){return s.isAtvet;}).length;
  var needContact=students.filter(function(s){
    if(!s.lastContact) return true;
    var days=(Date.now()-s.lastContact.getTime())/(1000*86400);
    return days>7;
  }).length;
  if(statsEl) statsEl.innerHTML=[
    ['Total students',total,'var(--amb)'],
    ['Active access',active,'#234d9e'],
    ['Africa TVET',atvet,'#007b40'],
    ['Need contact',needContact,'#c0392b']
  ].map(function(r){return '<div style="background:var(--bg-alt);border:1px solid var(--border);border-radius:9px;padding:10px 14px;text-align:center;min-width:80px;">'
    +'<div style="font-size:22px;font-weight:800;color:'+r[2]+';">'+r[1]+'</div>'
    +'<div style="font-size:11px;color:var(--fg3);margin-top:2px;">'+r[0]+'</div></div>';}).join('');

  // Student list
  if(students.length===0){
    listEl.innerHTML='<p style="color:var(--fg3);font-size:13px;text-align:center;padding:20px;">No registered students yet.</p>';
  } else {
    listEl.innerHTML=students.map(function(s){
      var daysAgo=s.lastContact?Math.floor((Date.now()-s.lastContact.getTime())/(1000*86400)):999;
      var urgentColor=daysAgo>7?'#c0392b':'var(--fg3)';
      var lastStr=s.lastContact?daysAgo===0?'Today':daysAgo+'d ago':'Never contacted';
      var ph=s.phone?(s.phone.replace(/\s/g,'').replace(/^0/,'27').replace(/^\+/,'')):'';
      var canWa=!!ph;
      return '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--border);flex-wrap:wrap;">'
        +'<div style="flex:1;min-width:120px;">'
        +'<strong style="font-size:13px;">'+s.username+'</strong>'
        +(s.isAtvet?'<span style="font-size:10px;background:rgba(0,122,61,.12);color:#007a3d;border-radius:4px;padding:1px 5px;margin-left:6px;">ATVET</span>':'')
        +'<div style="font-size:11px;color:var(--fg3);margin-top:2px;">'+s.tier+(s.phone?' · '+s.phone:'')+'</div>'
        +'<div style="font-size:11px;color:'+urgentColor+';margin-top:1px;">Last contact: '+lastStr+' · Quizzes: '+s.quizsSent+' · Check-ins: '+s.checkinsSent+'</div>'
        +'</div>'
        +(canWa?
          '<button class="biz-btn biz-btn-secondary" style="font-size:11px;padding:5px 9px;" onclick="mentorSendToOne(\''+s.username+'\',\''+ph+'\',\'quiz\')">📲 Quiz</button>'
          +'<button class="biz-btn biz-btn-secondary" style="font-size:11px;padding:5px 9px;" onclick="mentorSendToOne(\''+s.username+'\',\''+ph+'\',\'checkin\')">👋 Check-in</button>'
          :'<span style="font-size:11px;color:var(--fg3);">No phone</span>')
        +'<button class="biz-btn biz-btn-danger" style="font-size:11px;padding:5px 9px;" onclick="mentorRemoveStudent(\''+s.username+'\')">✕ Remove</button>'
        +'</div>';
    }).join('');
  }

  // Quiz bank preview
  if(quizEl){
    var currentWeek=Math.ceil(((Date.now()-new Date('2026-01-05').getTime())/(1000*86400*7))%52)||1;
    quizEl.innerHTML=MENTOR_QUIZ_BANK.map(function(q,i){
      var isCurrent=(q.week===currentWeek)||(i===((currentWeek-1)%MENTOR_QUIZ_BANK.length));
      return '<div style="border:1px solid '+(isCurrent?'var(--amb)':'var(--border)')+';border-radius:9px;padding:12px;margin-bottom:8px;background:'+(isCurrent?'rgba(30,133,64,.06)':'var(--bg-alt)')+';">'
        +'<div style="display:flex;justify-content:space-between;margin-bottom:6px;">'
        +'<strong style="font-size:12px;color:var(--fg2);">Week '+q.week+' Quiz</strong>'
        +(isCurrent?'<span style="font-size:10px;background:var(--amb);color:#fff;border-radius:4px;padding:1px 7px;">This week</span>':'')
        +'</div>'
        +'<p style="font-size:12.5px;margin:0 0 6px;"><strong>Q:</strong> '+q.question+'</p>'
        +'<div style="font-size:11.5px;color:var(--fg3);margin-bottom:4px;">'+q.options.join(' / ')+'</div>'
        +'<div style="font-size:11px;color:var(--amb);margin-bottom:8px;">Answer: '+q.answer+' ('+q.reference+')</div>'
        +'<button class="biz-btn biz-btn-primary" style="font-size:11px;" onclick="mentorSendQuizToAll('+i+')">Send to all students</button>'
        +'</div>';
    }).join('');
  }
}

function mentorRemoveStudent(username){
  /* Remove all LMS and mentor localStorage keys for this student */
  var keysToRemove=[];
  try{
    for(var i=0;i<localStorage.length;i++){
      var k=localStorage.key(i);
      if(!k) continue;
      if(k.startsWith(LMS_NS+username+'_')||k===LMS_NS+username
        ||k.startsWith(MENTOR_NS+'last_'+username)
        ||k===MENTOR_NS+'quiz_'+username
        ||k===MENTOR_NS+'checkin_'+username
        ||k===LMS_NS+'ph_'+username){
        keysToRemove.push(k);
      }
    }
  }catch(e){}
  keysToRemove.forEach(function(k){ try{localStorage.removeItem(k);}catch(e){} });
  mentorRender();
}

function mentorBuildQuizMsg(username, q){
  return 'Hi '+username+' 👋\n\n'
    +'*Weekly Installation Rules Quiz – Week '+q.week+'*\n\n'
    +'*Question:*\n'+q.question+'\n\n'
    +q.options.join('\n')+'\n\n'
    +'Reply with the letter of your answer (A, B, C or D). Answer and reference will be posted after the week.\n\n'
    +'Study hard! 💪\n— Tseke | ribattseke.co.za';
}

function mentorBuildCheckinMsg(username){
  return 'Hi '+username+' 👋\n\n'
    +'Just checking in — how is your Installation Rules studying going? Any questions on Paper 1 or Paper 2?\n\n'
    +'Feel free to ask anything, that is what I am here for. 🙏\n\n'
    +'— Tseke | ribattseke.co.za\n\n'
    +'Study sessions every week: ribattseke.co.za';
}

function mentorBuildMotivationMsg(username){
  var msgs=[
    'Hi '+username+' 🌟\nKeep going — every question you practice brings you one step closer to passing your trade test. You have got this! 💪\n— Tseke | ribattseke.co.za',
    'Hi '+username+' 👷‍♂️\nRemember: a qualified electrician is not made in a day. Consistency beats cramming. Log in and do one quiz today.\n— Tseke | ribattseke.co.za',
    'Hi '+username+' ⚡\nInstallation Rules can feel overwhelming, but you have already started — that is the hardest part. Keep it up!\n— Tseke | ribattseke.co.za'
  ];
  return msgs[Math.floor(Math.random()*msgs.length)];
}

function mentorSendToOne(username, ph, type){
  var q=MENTOR_QUIZ_BANK[parseInt(localStorage.getItem(MENTOR_NS+'quiz_'+username)||'0',10)%MENTOR_QUIZ_BANK.length];
  var msg=(type==='quiz')?mentorBuildQuizMsg(username,q)
         :(type==='checkin')?mentorBuildCheckinMsg(username)
         :mentorBuildMotivationMsg(username);
  var num=ph.replace(/\D/g,'');
  window.open('https://wa.me/'+num+'?text='+encodeURIComponent(msg),'_blank');
  // Record contact
  try{localStorage.setItem(MENTOR_NS+'last_'+username, new Date().toISOString());}catch(e){}
  if(type==='quiz'){
    var sent=parseInt(localStorage.getItem(MENTOR_NS+'quiz_'+username)||'0',10);
    try{localStorage.setItem(MENTOR_NS+'quiz_'+username, sent+1);}catch(e){}
  } else if(type==='checkin'){
    var chk=parseInt(localStorage.getItem(MENTOR_NS+'checkin_'+username)||'0',10);
    try{localStorage.setItem(MENTOR_NS+'checkin_'+username, chk+1);}catch(e){}
  }
  setTimeout(mentorRender,300);
}

function mentorSendQuizToAll(qIdx){
  var q=MENTOR_QUIZ_BANK[qIdx];
  // Build a list of students with phones then open WA for first; show summary
  var students=[];
  try{
    var seen={};
    for(var i=0;i<localStorage.length;i++){
      var k=localStorage.key(i);
      if(k&&k.startsWith(LMS_NS)){
        var parts=k.replace(LMS_NS,'').split('_');
        if(parts.length<2) continue;
        var u=parts.slice(0,-1).join('_');
        if(u&&!seen[u]){
          seen[u]=1;
          var ph=localStorage.getItem(LMS_NS+'ph_'+u)||'';
          if(ph) students.push({username:u,phone:ph});
        }
      }
    }
  }catch(e){}
  if(students.length===0){alert('No students with phone numbers found.');return;}
  // Open WA for each (opens multiple tabs; browser may block after first)
  students.forEach(function(s,i){
    var msg=mentorBuildQuizMsg(s.username,q);
    var num=s.phone.replace(/\D/g,'').replace(/^0/,'27');
    if(i===0){window.open('https://wa.me/'+num+'?text='+encodeURIComponent(msg),'_blank');}
    else{setTimeout(function(){window.open('https://wa.me/'+num+'?text='+encodeURIComponent(msg),'_blank');},i*800);}
    try{localStorage.setItem(MENTOR_NS+'last_'+s.username, new Date().toISOString());}catch(e){}
    var sent=parseInt(localStorage.getItem(MENTOR_NS+'quiz_'+s.username)||'0',10);
    try{localStorage.setItem(MENTOR_NS+'quiz_'+s.username, sent+1);}catch(e){}
  });
  alert('Sending quiz Week '+q.week+' to '+students.length+' student(s). Your browser will open WhatsApp for each — allow pop-ups if prompted.');
  setTimeout(mentorRender,1000);
}

function mentorSendWeeklyQuiz(){
  var currentWeek=Math.ceil(((Date.now()-new Date('2026-01-05').getTime())/(1000*86400*7))%52)||1;
  var idx=(currentWeek-1)%MENTOR_QUIZ_BANK.length;
  mentorSendQuizToAll(idx);
}

function mentorSendCheckin(){
  // Send check-in to students not contacted in 7+ days
  var students=[];
  try{
    var seen={};
    for(var i=0;i<localStorage.length;i++){
      var k=localStorage.key(i);
      if(k&&k.startsWith(LMS_NS)){
        var parts=k.replace(LMS_NS,'').split('_');
        if(parts.length<2) continue;
        var u=parts.slice(0,-1).join('_');
        if(u&&!seen[u]){
          seen[u]=1;
          var ph=localStorage.getItem(LMS_NS+'ph_'+u)||'';
          if(!ph) continue;
          var lc=localStorage.getItem(MENTOR_NS+'last_'+u);
          var daysAgo=lc?Math.floor((Date.now()-new Date(lc).getTime())/(1000*86400)):999;
          if(daysAgo>=7) students.push({username:u,phone:ph});
        }
      }
    }
  }catch(e){}
  if(students.length===0){alert('All students were contacted within the last 7 days. 🎉');return;}
  students.forEach(function(s,i){
    var msg=mentorBuildCheckinMsg(s.username);
    var num=s.phone.replace(/\D/g,'').replace(/^0/,'27');
    if(i===0){window.open('https://wa.me/'+num+'?text='+encodeURIComponent(msg),'_blank');}
    else{setTimeout(function(){window.open('https://wa.me/'+num+'?text='+encodeURIComponent(msg),'_blank');},i*800);}
    try{localStorage.setItem(MENTOR_NS+'last_'+s.username, new Date().toISOString());}catch(e){}
    var chk=parseInt(localStorage.getItem(MENTOR_NS+'checkin_'+s.username)||'0',10);
    try{localStorage.setItem(MENTOR_NS+'checkin_'+s.username, chk+1);}catch(e){}
  });
  alert('Sending check-in messages to '+students.length+' student(s) not contacted in 7+ days.');
  setTimeout(mentorRender,1000);
}

function mentorSendMotivation(){
  var students=[];
  try{
    var seen={};
    for(var i=0;i<localStorage.length;i++){
      var k=localStorage.key(i);
      if(k&&k.startsWith(LMS_NS)){
        var parts=k.replace(LMS_NS,'').split('_');
        if(parts.length<2) continue;
        var u=parts.slice(0,-1).join('_');
        if(u&&!seen[u]){
          seen[u]=1;
          var ph=localStorage.getItem(LMS_NS+'ph_'+u)||'';
          if(ph) students.push({username:u,phone:ph});
        }
      }
    }
  }catch(e){}
  if(students.length===0){alert('No students with phone numbers found.');return;}
  students.forEach(function(s,i){
    var msg=mentorBuildMotivationMsg(s.username);
    var num=s.phone.replace(/\D/g,'').replace(/^0/,'27');
    if(i===0){window.open('https://wa.me/'+num+'?text='+encodeURIComponent(msg),'_blank');}
    else{setTimeout(function(){window.open('https://wa.me/'+num+'?text='+encodeURIComponent(msg),'_blank');},i*800);}
    try{localStorage.setItem(MENTOR_NS+'last_'+s.username, new Date().toISOString());}catch(e){}
  });
  alert('Sending motivation to '+students.length+' student(s)!');
  setTimeout(mentorRender,1000);
}
/* ===== END WHATSAPP MENTORING HUB ===== */

/* Hub rendering triggers */
function hubRenderers(){
  var hub=localStorage.getItem('biz_hub_active');
  if(!hub) return;
  /* activate the section and its nav button, then render */
  hubShow(hub);
}

/* Hook into existing hubShow to trigger renders */
(function(){
  var orig=window.hubShow;
  window.hubShow=function(id,btn){
    /* find the matching nav button when not provided (programmatic navigation) */
    if(!btn) btn=document.querySelector('.hub-nav-btn[onclick*="\''+id+'\'"]')||document.querySelector('.hub-nav-btn[onclick*="\"'+id+'\""]');
    if(typeof orig==='function')orig(id,btn);
    localStorage.setItem('biz_hub_active',id);
    // Scroll the activated section into view so it appears above the page fold
    setTimeout(function(){
      var sec=document.getElementById(id);
      if(sec){
        var nav=document.querySelector('nav');
        var navH=nav?nav.getBoundingClientRect().height:56;
        var top=sec.getBoundingClientRect().top+window.scrollY-navH-8;
        window.scrollTo({top:Math.max(0,top),behavior:'smooth'});
      }
    },20);
    setTimeout(function(){
      if(id==='hub-jobs')jobRender();
      else if(id==='hub-coc')cocRender();
      else if(id==='hub-poe')poeRender();
      else if(id==='hub-projects')projRender();
      else if(id==='hub-hs'){hsShow('hs-risk');}
      else if(id==='hub-tests'){tstShow('tst-elec');}
      else if(id==='hub-hr'){hrShow('hr-emp');}
      else if(id==='hub-sops')sopRender();
      else if(id==='hub-ecsa')ecsaRender();
      else if(id==='hub-mentor')mentorRender();
      else if(id==='hub-rates')ratesRender();
      else if(id==='hub-enquiries')enquiriesRender();
      else if(id==='hub-po')poRender();
      else if(id==='hub-pr')prRender();
      else if(id==='hub-travel')travelRender();
      else if(id==='hub-stock')stockRender();
      else if(id==='hub-delivery')deliveryRender();
      else if(id==='hub-handover')handoverRender();
      else if(id==='hub-warranty')warrantyRender();
      else if(id==='hub-orders')ordersRender();
      else if(id==='hub-kyc')kycRender();
      else if(id==='hub-expiry')expiryRender();
      else if(id==='hub-financials')finRender();
    },50);
  };
})();
window.lmsAdminEntry=lmsAdminEntry;
window._engageShowDonateFull=function(){if(typeof lmsAdminEntry==="function")lmsAdminEntry();};

/* ===== ISSUE NEW KEY ===== */
function admIssueKey(){
  var phone=(document.getElementById('adm-new-key-phone')||{}).value||'';
  var firstName=(document.getElementById('adm-new-key-fname')||{}).value||'';
  var secondName=(document.getElementById('adm-new-key-sname')||{}).value||'';
  var surname=(document.getElementById('adm-new-key-surname')||{}).value||'';
  var email=(document.getElementById('adm-new-key-email')||{}).value||'';
  var tier=(document.getElementById('adm-new-key-tier')||{}).value||'ir';
  var out=document.getElementById('adm-new-key-out');
  phone=phone.replace(/\D/g,'');
  firstName=firstName.trim();
  surname=surname.trim();
  if(!phone||phone.length<9){if(out)out.innerHTML='<span style="color:red;font-size:12px;">Enter a valid phone number.</span>';return;}
  if(!firstName){if(out)out.innerHTML='<span style="color:red;font-size:12px;">Enter the recipient first name.</span>';return;}
  if(!surname){if(out)out.innerHTML='<span style="color:red;font-size:12px;">Enter the recipient surname.</span>';return;}
  // Check for duplicate before generating
  var scopes=(tier==='both')?['ir','ecsa']:[tier];
  var keys={};
  var label={'ir':'IR Companion','ecsa':'ECSA Companion','both':'Both Companions'}[tier]||tier;
  var fullName=firstName+(secondName?' '+secondName:'')+' '+surname;
  var phone10=phone.replace(/^0/,'').slice(-10).padStart(10,'0');
  var htmlKeys='';
  scopes.forEach(function(sc){
    var existing=rttIsDuplicateActive(email, phone, sc);
    var key;
    if(existing && existing.length===13){
      key=existing;
      var ns2=(sc==='ecsa')?ECSA_KEY_NS:IR_KEY_NS;
      htmlKeys+='<div style="font-size:11px;color:#e67e22;margin-bottom:3px;">⚠ Existing active key ('+sc.toUpperCase()+') — wrong initials? '
        +'<button onclick="try{localStorage.removeItem(\''+ns2+existing+'\');}catch(e){} this.closest(\'div\').innerHTML=\'<span style=&quot;color:green;font-size:11px;&quot;>Revoked. Re-generate now.</span>\';" '
        +'style="font-size:10px;padding:2px 7px;background:#c0392b;color:#fff;border:none;border-radius:4px;cursor:pointer;margin-left:4px;">Revoke &amp; re-generate</button></div>';
    } else {
      key=rttGenerateKey(firstName, secondName, email, phone, sc, surname);
      var ns=(sc==='ecsa')?ECSA_KEY_NS:IR_KEY_NS;
      try{
        var keyRec={who:fullName,phone:phone,email:email,issuedAt:Date.now(),scope:sc};
        localStorage.setItem(ns+key,JSON.stringify(keyRec));
      }catch(e){}
      htmlKeys+='<div style="font-size:11px;color:var(--fg3);margin-bottom:3px;">New key ('+sc.toUpperCase()+'):</div>';
    }
    keys[sc]=key;
    htmlKeys+='<div style="font-family:monospace;font-size:15px;font-weight:700;color:var(--amb);letter-spacing:1.5px;user-select:all;margin-bottom:6px;">'+key+'</div>'
      +'<button onclick="navigator.clipboard.writeText(\''+key+'\').then(function(){var b=this;b.textContent=\'Copied!\';setTimeout(function(){b.textContent=\'Copy\';},1500);}.bind(this)).catch(function(){});" '
      +'style="font-size:11px;padding:3px 10px;background:var(--amb);color:#fff;border:none;border-radius:5px;cursor:pointer;margin-bottom:10px;">Copy</button>';
  });
  if(out){
    var waKey=keys['ir']||keys['ecsa']||'';
    out.innerHTML='<div style="background:var(--bg-alt);border-radius:8px;padding:12px;margin-top:8px;">'
      +'<div style="font-size:11px;color:var(--fg3);margin-bottom:6px;">Key generated for <strong>'+esc(fullName)+'</strong> ('+label+'):</div>'
      +htmlKeys
      +'<div style="font-size:11px;color:var(--fg3);margin-top:4px;">Send to '+phone+' via WhatsApp: '
      +'<a href="https://wa.me/27'+phone10+'?text=Hi+'+encodeURIComponent(fullName)+'%2C+your+Riba+T+Tseke+Learning+Companion+key%3A+'+encodeURIComponent(waKey)+'" target="_blank" style="color:var(--amb);">Send ↗</a></div>'
      +'</div>';
  }
}

/* ===== COMPANION ENQUIRIES LOG ===== */
var ENQ_NS='biz_enq_';
function enquiriesRender(){
  var list=document.getElementById('hub-enq-list');
  if(!list)return;
  var entries=[];
  try{
    for(var i=0;i<localStorage.length;i++){
      var k=localStorage.key(i);
      if(k&&k.indexOf(ENQ_NS)===0){
        try{var v=JSON.parse(localStorage.getItem(k));if(v)entries.push(v);}catch(e){}
      }
    }
  }catch(e){}
  entries.sort(function(a,b){return (b.ts||0)-(a.ts||0);});
  if(!entries.length){
    list.innerHTML='<div style="text-align:center;padding:24px 0;color:var(--fg3);">No logged enquiries yet.</div>';
    return;
  }
  var html='<div style="display:grid;gap:10px;">';
  entries.forEach(function(e,idx){
    var dt=new Date(e.ts||0);
    var dtStr=dt.toLocaleDateString('en-ZA',{day:'2-digit',month:'short',year:'numeric'})+' '+dt.toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit'});
    var lang=e.lang||'en';
    var phone=e.phone||'';
    var waLink=phone?'https://wa.me/27'+phone.replace(/^0/,'').replace(/\D/g,''):'https://wa.me/27724748888';
    html+='<div style="background:var(--bg-alt);border-radius:8px;padding:12px 14px;">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">'
      +'<span style="font-size:11px;color:var(--fg3);">'+dtStr+' &bull; lang: '+lang+'</span>'
      +'<div style="display:flex;gap:6px;">'
      +'<a href="mailto:ribattseke@gmail.com?subject=Re:+Companion+query&body='+encodeURIComponent('Query: '+e.q+'\n\nResponse: '+e.a) +'" style="font-size:11px;padding:3px 8px;background:var(--border);color:var(--fg);border-radius:5px;text-decoration:none;">&#9993; Email</a>'
      +'<a href="'+waLink+'?text='+encodeURIComponent('Hi! Regarding your question: "'+e.q+'" — ') +'" target="_blank" style="font-size:11px;padding:3px 8px;background:#25d366;color:#fff;border-radius:5px;text-decoration:none;">&#128172; WhatsApp</a>'
      +(phone?'<a href="tel:'+phone+'" style="font-size:11px;padding:3px 8px;background:var(--amb);color:#fff;border-radius:5px;text-decoration:none;">&#128222; Call</a>':'')
      +'</div></div>'
      +'<div style="font-size:13px;font-weight:600;color:var(--fg);margin-bottom:4px;">Q: '+_esc(e.q)+'</div>'
      +'<div style="font-size:12.5px;color:var(--fg2);line-height:1.5;">A: '+_esc(e.a)+'</div>'
      +'<button onclick="admDelEnq(\''+e.id+'\')" style="margin-top:8px;font-size:11px;padding:2px 8px;background:transparent;border:1px solid var(--border);border-radius:5px;color:var(--fg3);cursor:pointer;">Remove</button>'
      +'</div>';
  });
  html+='</div>';
  list.innerHTML=html;
}
function admDelEnq(id){
  try{localStorage.removeItem(ENQ_NS+id);}catch(e){}
  enquiriesRender();
}
function _esc(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

/* ===== GENERIC FORM MODAL HELPER ===== */
function _admForm(title,fields,onSave){
  var existing=document.getElementById('_admf-modal');
  if(existing)existing.remove();
  var fhtml=fields.map(function(f){
    var inp;
    if(f.type==='textarea'){
      inp='<textarea id="admf-'+f.id+'" rows="3" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg);font-size:13px;font-family:inherit;resize:vertical;">'+_esc(f.value||'')+'</textarea>';
    }else if(f.type==='select'){
      var opts=(f.options||[]).map(function(o){return '<option value="'+_esc(o.v)+'"'+(o.v===f.value?' selected':'')+'>'+_esc(o.l)+'</option>';}).join('');
      inp='<select id="admf-'+f.id+'" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg);font-size:13px;">'+opts+'</select>';
    }else{
      inp='<input id="admf-'+f.id+'" type="'+(f.type||'text')+'" value="'+_esc(f.value||'')+'" placeholder="'+(f.placeholder||'')+'" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg);font-size:13px;">';
    }
    return '<div style="margin-bottom:12px;"><label style="display:block;font-size:12.5px;font-weight:600;color:var(--fg2);margin-bottom:4px;">'+_esc(f.label)+(f.required?'<span style="color:#e53;"> *</span>':'')+'</label>'+inp+'</div>';
  }).join('');
  var ov=document.createElement('div');
  ov.id='_admf-modal';
  ov.className='biz-modal-bg';
  ov.innerHTML='<div class="biz-modal" style="max-height:85vh;overflow-y:auto;">'
    +'<h4 style="margin:0 0 14px;font-size:15px;font-weight:700;">'+_esc(title)+'</h4>'
    +fhtml
    +'<div class="biz-modal-actions" style="margin-top:16px;">'
    +'<button class="biz-btn biz-btn-primary" id="_admf-save">Save</button>'
    +'<button class="biz-btn" onclick="document.getElementById(\'_admf-modal\').remove()">Cancel</button>'
    +'</div></div>';
  document.body.appendChild(ov);
  ov.scrollIntoView({behavior:'smooth',block:'nearest'});
  document.getElementById('_admf-save').onclick=function(){
    var data={};
    fields.forEach(function(f){var el=document.getElementById('admf-'+f.id);data[f.id]=el?(el.value||''):'';});
    onSave(data,ov);
  };
}

/* ===== PURCHASE ORDERS ===== */
var PO_NS='biz_po_';
function poRender(){
  var list=document.getElementById('hub-po-list');
  if(!list)return;
  var items=_hubGetAll(PO_NS);
  if(!items.length){list.innerHTML='<div style="text-align:center;padding:16px 0;color:var(--fg3);">No purchase orders yet.</div>';return;}
  items.sort(function(a,b){return(b.ts||0)-(a.ts||0);});
  var html='<div style="display:grid;gap:8px;">';
  items.forEach(function(o){
    var status={'pending':'🟡 Pending','approved':'🟢 Approved','received':'✅ Received','cancelled':'🔴 Cancelled'}[o.status]||o.status||'pending';
    html+='<div style="background:var(--bg-alt);border-radius:8px;padding:11px 13px;display:flex;gap:10px;align-items:flex-start;">'
      +'<div style="flex:1;">'
      +'<div style="font-size:13px;font-weight:700;">PO-'+o.poNum+' &bull; '+_esc(o.supplier)+'</div>'
      +'<div style="font-size:12px;color:var(--fg2);margin:2px 0;">'+_esc(o.desc)+'</div>'
      +'<div style="font-size:11.5px;color:var(--fg3);">R'+Number(o.amount||0).toFixed(2)+' &bull; '+o.date+' &bull; '+status+'</div>'
      +'</div>'
      +'<button onclick="admDelItem(\''+PO_NS+'\',\''+o.id+'\',poRender)" style="font-size:11px;padding:2px 7px;background:transparent;border:1px solid var(--border);border-radius:5px;color:var(--fg3);cursor:pointer;">✕</button>'
      +'</div>';
  });
  html+='</div>';
  list.innerHTML=html;
}
function poAdd(){
  _admForm('New Purchase Order',[
    {id:'supplier',label:'Supplier name',required:true},
    {id:'desc',label:'Items / description',type:'textarea',required:true},
    {id:'amount',label:'Total amount (R)',type:'number',placeholder:'0.00'},
    {id:'status',label:'Status',type:'select',value:'pending',options:[
      {v:'pending',l:'🟡 Pending'},{v:'approved',l:'🟢 Approved'},{v:'received',l:'✅ Received'},{v:'cancelled',l:'🔴 Cancelled'}
    ]}
  ],function(data,ov){
    if(!data.supplier.trim()){alert('Supplier name is required.');return;}
    var id=Date.now().toString(36);
    var num=String((_hubGetAll(PO_NS).length||0)+1).padStart(4,'0');
    var rec={id:id,poNum:num,supplier:data.supplier.trim(),desc:data.desc.trim(),amount:parseFloat(data.amount)||0,date:new Date().toLocaleDateString('en-ZA'),status:data.status||'pending',ts:Date.now()};
    try{localStorage.setItem(PO_NS+id,JSON.stringify(rec));}catch(e){}
    ov.remove();poRender();
  });
}

/* ===== PURCHASE REQUESTS ===== */
var PR_NS='biz_pr_';
function prRender(){
  var list=document.getElementById('hub-pr-list');
  if(!list)return;
  var items=_hubGetAll(PR_NS);
  if(!items.length){list.innerHTML='<div style="text-align:center;padding:16px 0;color:var(--fg3);">No purchase requests yet.</div>';return;}
  items.sort(function(a,b){return(b.ts||0)-(a.ts||0);});
  var html='<div style="display:grid;gap:8px;">';
  items.forEach(function(r){
    var prio={'low':'🔵 Low','medium':'🟡 Medium','high':'🔴 High'}[r.priority]||r.priority||'low';
    html+='<div style="background:var(--bg-alt);border-radius:8px;padding:11px 13px;display:flex;gap:10px;align-items:flex-start;">'
      +'<div style="flex:1;">'
      +'<div style="font-size:13px;font-weight:700;">'+_esc(r.desc)+'</div>'
      +'<div style="font-size:11.5px;color:var(--fg3);margin-top:3px;">Est. R'+Number(r.amount||0).toFixed(2)+' &bull; '+r.date+' &bull; '+prio+'</div>'
      +'<div style="font-size:11px;color:var(--fg3);">Requested by: '+_esc(r.requester||'—')+'</div>'
      +'</div>'
      +'<button onclick="admDelItem(\''+PR_NS+'\',\''+r.id+'\',prRender)" style="font-size:11px;padding:2px 7px;background:transparent;border:1px solid var(--border);border-radius:5px;color:var(--fg3);cursor:pointer;">✕</button>'
      +'</div>';
  });
  html+='</div>';
  list.innerHTML=html;
}
function prAdd(){
  _admForm('New Purchase Request',[
    {id:'desc',label:'What is needed?',type:'textarea',required:true},
    {id:'amount',label:'Estimated cost (R)',type:'number',placeholder:'0.00'},
    {id:'requester',label:'Requested by (name)',placeholder:'Your name'},
    {id:'priority',label:'Priority',type:'select',value:'medium',options:[
      {v:'low',l:'🔵 Low'},{v:'medium',l:'🟡 Medium'},{v:'high',l:'🔴 High'}
    ]}
  ],function(data,ov){
    if(!data.desc.trim()){alert('Description is required.');return;}
    var id=Date.now().toString(36);
    var rec={id:id,desc:data.desc.trim(),amount:parseFloat(data.amount)||0,requester:data.requester.trim()||'—',priority:data.priority||'medium',date:new Date().toLocaleDateString('en-ZA'),ts:Date.now()};
    try{localStorage.setItem(PR_NS+id,JSON.stringify(rec));}catch(e){}
    ov.remove();prRender();
  });
}

/* ===== TRAVEL MANAGEMENT ===== */
var TRAVEL_NS='biz_travel_';
function travelRender(){
  var list=document.getElementById('hub-travel-list');
  if(!list)return;
  var items=_hubGetAll(TRAVEL_NS);
  if(!items.length){list.innerHTML='<div style="text-align:center;padding:16px 0;color:var(--fg3);">No travel records yet.</div>';return;}
  items.sort(function(a,b){return(b.ts||0)-(a.ts||0);});
  var html='<div style="display:grid;gap:8px;">';
  items.forEach(function(t){
    var totalCost=(parseFloat(t.fuel||0)+parseFloat(t.toll||0)+parseFloat(t.other||0)).toFixed(2);
    html+='<div style="background:var(--bg-alt);border-radius:8px;padding:11px 13px;display:flex;gap:10px;align-items:flex-start;">'
      +'<div style="flex:1;">'
      +'<div style="font-size:13px;font-weight:700;">✈ '+_esc(t.destination)+' &bull; '+t.date+'</div>'
      +'<div style="font-size:12px;color:var(--fg2);margin:2px 0;">'+_esc(t.purpose)+'</div>'
      +'<div style="font-size:11.5px;color:var(--fg3);">'+t.km+' km &bull; Fuel: R'+parseFloat(t.fuel||0).toFixed(2)+' | Toll: R'+parseFloat(t.toll||0).toFixed(2)+' | Total: R'+totalCost+'</div>'
      +'</div>'
      +'<button onclick="admDelItem(\''+TRAVEL_NS+'\',\''+t.id+'\',travelRender)" style="font-size:11px;padding:2px 7px;background:transparent;border:1px solid var(--border);border-radius:5px;color:var(--fg3);cursor:pointer;">✕</button>'
      +'</div>';
  });
  html+='</div>';
  list.innerHTML=html;
}
function travelAdd(){
  _admForm('New Travel Record',[
    {id:'destination',label:'Destination',required:true},
    {id:'purpose',label:'Purpose / description',required:true},
    {id:'km',label:'Distance (km)',type:'number',placeholder:'0'},
    {id:'fuel',label:'Fuel cost (R)',type:'number',placeholder:'0.00'},
    {id:'toll',label:'Toll cost (R)',type:'number',placeholder:'0.00'},
    {id:'other',label:'Other costs (R)',type:'number',placeholder:'0.00'}
  ],function(data,ov){
    if(!data.destination.trim()){alert('Destination is required.');return;}
    if(!data.purpose.trim()){alert('Purpose is required.');return;}
    var id=Date.now().toString(36);
    var rec={id:id,destination:data.destination.trim(),purpose:data.purpose.trim(),km:parseFloat(data.km)||0,fuel:parseFloat(data.fuel)||0,toll:parseFloat(data.toll)||0,other:parseFloat(data.other)||0,date:new Date().toLocaleDateString('en-ZA'),ts:Date.now()};
    try{localStorage.setItem(TRAVEL_NS+id,JSON.stringify(rec));}catch(e){}
    ov.remove();travelRender();
  });
}

/* ===== STOCK & MATERIALS ===== */
var STOCK_NS='biz_stock_';
function stockRender(){
  var list=document.getElementById('hub-stock-list');
  if(!list)return;
  var items=_hubGetAll(STOCK_NS);
  if(!items.length){list.innerHTML='<div style="text-align:center;padding:16px 0;color:var(--fg3);">No stock items yet.</div>';return;}
  items.sort(function(a,b){return _esc(a.name).localeCompare(_esc(b.name));});
  var html='<table style="width:100%;border-collapse:collapse;font-size:12.5px;">'
    +'<thead><tr style="text-align:left;border-bottom:1px solid var(--border);">'
    +'<th style="padding:6px 8px;">Item</th><th style="padding:6px 8px;">Unit</th>'
    +'<th style="padding:6px 8px;">On Hand</th><th style="padding:6px 8px;">Issued</th>'
    +'<th style="padding:6px 8px;">Unit Cost</th><th style="padding:6px 4px;"></th></tr></thead><tbody>';
  items.forEach(function(s){
    var onHand=parseInt(s.onHand||0);
    var issued=parseInt(s.issued||0);
    var alert=onHand<=parseInt(s.reorder||2)?'color:red;font-weight:700;':'';
    html+='<tr style="border-bottom:1px solid var(--border);">'
      +'<td style="padding:6px 8px;">'+_esc(s.name)+'</td>'
      +'<td style="padding:6px 8px;color:var(--fg3);">'+_esc(s.unit||'ea')+'</td>'
      +'<td style="padding:6px 8px;'+alert+'">'+onHand+'</td>'
      +'<td style="padding:6px 8px;color:var(--fg3);">'+issued+'</td>'
      +'<td style="padding:6px 8px;">R'+Number(s.cost||0).toFixed(2)+'</td>'
      +'<td style="padding:4px;"><button onclick="stockIssue(\''+s.id+'\')" style="font-size:10px;padding:2px 6px;background:var(--amb);color:#fff;border:none;border-radius:4px;cursor:pointer;">Issue</button>'
      +' <button onclick="admDelItem(\''+STOCK_NS+'\',\''+s.id+'\',stockRender)" style="font-size:10px;padding:2px 6px;background:transparent;border:1px solid var(--border);border-radius:4px;cursor:pointer;color:var(--fg3);">✕</button></td>'
      +'</tr>';
  });
  html+='</tbody></table>';
  list.innerHTML=html;
}
function stockAdd(){
  _admForm('Add Stock Item',[
    {id:'name',label:'Item name',required:true},
    {id:'unit',label:'Unit (ea / m / kg / roll etc.)',value:'ea'},
    {id:'onHand',label:'Quantity on hand',type:'number',placeholder:'0'},
    {id:'cost',label:'Unit cost (R)',type:'number',placeholder:'0.00'},
    {id:'reorder',label:'Reorder alert at quantity',type:'number',value:'2'}
  ],function(data,ov){
    if(!data.name.trim()){alert('Item name is required.');return;}
    var id=Date.now().toString(36);
    var rec={id:id,name:data.name.trim(),unit:data.unit.trim()||'ea',onHand:parseInt(data.onHand)||0,issued:0,cost:parseFloat(data.cost)||0,reorder:parseInt(data.reorder)||2,ts:Date.now()};
    try{localStorage.setItem(STOCK_NS+id,JSON.stringify(rec));}catch(e){}
    ov.remove();stockRender();
  });
}
function stockIssue(id){
  _admForm('Issue Stock',[
    {id:'qty',label:'Quantity to issue',type:'number',value:'1',required:true}
  ],function(data,ov){
    var qty=parseInt(data.qty)||0;
    if(!qty){alert('Enter a valid quantity.');return;}
    try{
      var s=JSON.parse(localStorage.getItem(STOCK_NS+id)||'{}');
      s.onHand=Math.max(0,(parseInt(s.onHand)||0)-qty);
      s.issued=(parseInt(s.issued)||0)+qty;
      localStorage.setItem(STOCK_NS+id,JSON.stringify(s));
    }catch(e){}
    ov.remove();stockRender();
  });
}

/* ===== DELIVERY NOTES ===== */
var DN_NS='biz_dn_';
function deliveryRender(){
  var list=document.getElementById('hub-delivery-list');
  if(!list)return;
  var items=_hubGetAll(DN_NS);
  if(!items.length){list.innerHTML='<div style="text-align:center;padding:16px 0;color:var(--fg3);">No delivery notes yet.</div>';return;}
  items.sort(function(a,b){return(b.ts||0)-(a.ts||0);});
  var html='<div style="display:grid;gap:8px;">';
  items.forEach(function(d){
    html+='<div style="background:var(--bg-alt);border-radius:8px;padding:11px 13px;display:flex;gap:10px;align-items:flex-start;">'
      +'<div style="flex:1;">'
      +'<div style="font-size:13px;font-weight:700;">DN-'+d.dnNum+' &bull; Job: '+_esc(d.jobRef)+'</div>'
      +'<div style="font-size:12px;color:var(--fg2);margin:2px 0;">'+_esc(d.items)+'</div>'
      +'<div style="font-size:11.5px;color:var(--fg3);">Qty: '+d.qty+' &bull; '+d.date+' &bull; Driver: '+_esc(d.driver||'—')+'</div>'
      +'</div>'
      +'<button onclick="admDelItem(\''+DN_NS+'\',\''+d.id+'\',deliveryRender)" style="font-size:11px;padding:2px 7px;background:transparent;border:1px solid var(--border);border-radius:5px;color:var(--fg3);cursor:pointer;">✕</button>'
      +'</div>';
  });
  html+='</div>';
  list.innerHTML=html;
}
function deliveryAdd(){
  _admForm('New Delivery Note',[
    {id:'jobRef',label:'Job reference',required:true},
    {id:'items',label:'Items delivered',type:'textarea',required:true},
    {id:'qty',label:'Quantity',type:'number',value:'1'},
    {id:'driver',label:'Driver name',placeholder:'Driver / courier name'}
  ],function(data,ov){
    if(!data.jobRef.trim()){alert('Job reference is required.');return;}
    if(!data.items.trim()){alert('Items description is required.');return;}
    var id=Date.now().toString(36);
    var num=String((_hubGetAll(DN_NS).length||0)+1).padStart(4,'0');
    var rec={id:id,dnNum:num,jobRef:data.jobRef.trim(),items:data.items.trim(),qty:data.qty||'1',driver:data.driver.trim()||'—',date:new Date().toLocaleDateString('en-ZA'),ts:Date.now()};
    try{localStorage.setItem(DN_NS+id,JSON.stringify(rec));}catch(e){}
    ov.remove();deliveryRender();
  });
}

/* ===== SITE HANDOVERS ===== */
var HO_NS='biz_ho_';
function handoverRender(){
  var list=document.getElementById('hub-handover-list');
  if(!list)return;
  var items=_hubGetAll(HO_NS);
  if(!items.length){list.innerHTML='<div style="text-align:center;padding:16px 0;color:var(--fg3);">No handover records yet.</div>';return;}
  items.sort(function(a,b){return(b.ts||0)-(a.ts||0);});
  var html='<div style="display:grid;gap:8px;">';
  items.forEach(function(h){
    var signed=h.signed?'✅ Signed off':'⏳ Pending';
    html+='<div style="background:var(--bg-alt);border-radius:8px;padding:11px 13px;display:flex;gap:10px;align-items:flex-start;">'
      +'<div style="flex:1;">'
      +'<div style="font-size:13px;font-weight:700;">'+_esc(h.jobRef)+' &bull; '+_esc(h.client)+'</div>'
      +'<div style="font-size:12px;color:var(--fg2);margin:2px 0;">'+_esc(h.punch||'No outstanding items')+'</div>'
      +'<div style="font-size:11.5px;color:var(--fg3);">'+h.date+' &bull; '+signed+'</div>'
      +'</div>'
      +'<button onclick="admDelItem(\''+HO_NS+'\',\''+h.id+'\',handoverRender)" style="font-size:11px;padding:2px 7px;background:transparent;border:1px solid var(--border);border-radius:5px;color:var(--fg3);cursor:pointer;">✕</button>'
      +'</div>';
  });
  html+='</div>';
  list.innerHTML=html;
}
function handoverAdd(){
  _admForm('New Site Handover',[
    {id:'jobRef',label:'Job reference',required:true},
    {id:'client',label:'Client name',required:true},
    {id:'punch',label:'Outstanding punch list items',type:'textarea',placeholder:'List any outstanding items or leave blank if none'},
    {id:'signed',label:'Client signed off?',type:'select',value:'no',options:[
      {v:'no',l:'⏳ Not yet signed'},{v:'yes',l:'✅ Signed off'}
    ]}
  ],function(data,ov){
    if(!data.jobRef.trim()){alert('Job reference is required.');return;}
    if(!data.client.trim()){alert('Client name is required.');return;}
    var id=Date.now().toString(36);
    var rec={id:id,jobRef:data.jobRef.trim(),client:data.client.trim(),punch:data.punch.trim(),signed:data.signed==='yes',date:new Date().toLocaleDateString('en-ZA'),ts:Date.now()};
    try{localStorage.setItem(HO_NS+id,JSON.stringify(rec));}catch(e){}
    ov.remove();handoverRender();
  });
}

/* ===== WARRANTIES ===== */
var WR_NS='biz_wr_';
function warrantyRender(){
  var list=document.getElementById('hub-warranty-list');
  if(!list)return;
  var items=_hubGetAll(WR_NS);
  if(!items.length){list.innerHTML='<div style="text-align:center;padding:16px 0;color:var(--fg3);">No warranty records yet.</div>';return;}
  items.sort(function(a,b){return(b.ts||0)-(a.ts||0);});
  var now=Date.now();
  var html='<div style="display:grid;gap:8px;">';
  items.forEach(function(w){
    var end=new Date(w.endDate||w.date).getTime();
    var daysLeft=Math.ceil((end-now)/(86400000));
    var status=daysLeft<0?'🔴 Expired':daysLeft<30?'🟡 Expiring soon':'🟢 Active';
    html+='<div style="background:var(--bg-alt);border-radius:8px;padding:11px 13px;display:flex;gap:10px;align-items:flex-start;">'
      +'<div style="flex:1;">'
      +'<div style="font-size:13px;font-weight:700;">'+_esc(w.jobRef)+' &bull; '+_esc(w.client)+'</div>'
      +'<div style="font-size:12px;color:var(--fg2);margin:2px 0;">'+_esc(w.defects||'No defects logged')+'</div>'
      +'<div style="font-size:11.5px;color:var(--fg3);">Start: '+w.startDate+' &bull; End: '+w.endDate+' &bull; '+status+(daysLeft>=0?' ('+daysLeft+'d left)':'')+'</div>'
      +'</div>'
      +'<button onclick="admDelItem(\''+WR_NS+'\',\''+w.id+'\',warrantyRender)" style="font-size:11px;padding:2px 7px;background:transparent;border:1px solid var(--border);border-radius:5px;color:var(--fg3);cursor:pointer;">✕</button>'
      +'</div>';
  });
  html+='</div>';
  list.innerHTML=html;
}
function warrantyAdd(){
  var today=new Date().toISOString().slice(0,10);
  _admForm('New Warranty Record',[
    {id:'jobRef',label:'Job reference',required:true},
    {id:'client',label:'Client name',required:true},
    {id:'startDate',label:'Warranty start date',type:'date',value:today},
    {id:'months',label:'Warranty period (months)',type:'number',value:'12'},
    {id:'defects',label:'Known defects / notes',type:'textarea',placeholder:'Leave blank if none'}
  ],function(data,ov){
    if(!data.jobRef.trim()){alert('Job reference is required.');return;}
    if(!data.client.trim()){alert('Client name is required.');return;}
    var months=parseInt(data.months)||12;
    var d=new Date(data.startDate||today);d.setMonth(d.getMonth()+months);
    var endDate=d.toISOString().slice(0,10);
    var id=Date.now().toString(36);
    var rec={id:id,jobRef:data.jobRef.trim(),client:data.client.trim(),startDate:data.startDate||today,endDate:endDate,defects:data.defects.trim(),ts:Date.now()};
    try{localStorage.setItem(WR_NS+id,JSON.stringify(rec));}catch(e){}
    ov.remove();warrantyRender();
  });
}

/* ===== SHARED HELPERS ===== */
function _hubGetAll(ns){
  var out=[];
  try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.indexOf(ns)===0){try{var v=JSON.parse(localStorage.getItem(k));if(v)out.push(v);}catch(e){}}}}catch(e){}
  return out;
}
function admDelItem(ns,id,cb){
  if(!confirm('Remove this record?'))return;
  try{localStorage.removeItem(ns+id);}catch(e){}
  if(typeof cb==='function')cb();
}


(function(){
  var b64='/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAYGBgYHBgcICAcKCwoLCg8ODAwODxYQERAREBYiFRkVFRkVIh4kHhweJB42KiYmKjY+NDI0PkxERExfWl98fKcBBgYGBgcGBwgIBwoLCgsKDw4MDA4PFhAREBEQFiIVGRUVGRUiHiQeHB4kHjYqJiYqNj40MjQ+TERETF9aX3x8p//CABEIA4QGQAMBIgACEQEDEQH/xAAyAAEAAgMBAQAAAAAAAAAAAAAAAQIDBAUGBwEBAQEBAQEAAAAAAAAAAAAAAAECAwUE/9oADAMBAAIQAxAAAAIM+LzuZ0+Zr0QdkwQmAFBAUAAEBUwSYFABEwEhExIIAUACQiATEiAAATASESAgAAAmJEAAAAAmYkEkAhNQAACYSQmAkIAAAACYBMAAFAAJhACYAAAJiQQJRIgAAVMEJgBSapIUAAEBQSYFAAABEwWSEBQABKQACYiVA9IM+PzuZ0+Zr0gdhKIAiwhJAUACa2hAACJUAEEiEiEiEkJLCYAJiSEBIQAABMSCSIkISQAACYmABMSQABMSSSAICISQAABKBMQTKAmAAkQkImABMAAAFBJgCJJhJAAAJAQEwExIiYCRBIhIhJAAUACYEAABQAAJhKIFTEpAUABKETELJCSAF9IM+PzuZ0+Zr0gdkoQFATEpAUASiBQItEJKYAAFogBQJRKQFAEogAEwJi1QABaIEpIi1SUSQASAIABMAtUEiQWQgLETBExJAAAJgAAJiREyCYETBAAEwJiYAAItAAATEkAAEiAAASgmAAWgQAFTEpAUASiABRBKYQFATBAUBMSkJhQBIgQFAmBAX0gz4/O5nT5mvSTB1mtoAUBMEEkJKiYQFABJIAEqlq2gBSYExIABMBAQAFkhBJEoJiYJkFbQRMSIkJiREwQAACSBaJEiTEwImFVmBMCYASRMSQAAmSJWICImqiAAAAmAAAAABMCYASEAAAAmAkRKCYmAAAAAkEAFAABAEwCYAUACSEJgTABQACLJBJ6MZ8nncvqczXog7EwgKAACAqJICgAhMAKBMTCAoAkRIhIRIgIAmJEWhYAmJQCSSImCJAkAItBAIAJIlJEzKRIImCCFQAAAABIiZkSlImYIiYKxMKAAAAAAAAAAJETABMAAAAAAJESIAmBMBMBMCzEkgKAACAoExMICgAAgKJSAoAEWiUgL6QZ8jnczp8zXog7RKUiYEwAAKAiQBKspMACgARMkiQmARMCYLMwESIkQgJiQmFhMCYlIlIkRCAFSlBAiZWImAASRYSSQQQCIQsoAAABMkWSiUoTvGni6/HhCt0AiQCkElEgAAAAABMAAAAkIAAAAAkiYEoAAAAKCTAIkRIoIAJImBMRIACgCSEwkoAESKB6QZ8jnczp8zXoiHWYkoACJAACJgkAAITAAmACpACFoAQkqLQREwAglSRESImJQSJSREwQkSEARMAKASRKRIkRMLECxEwAATEwJSTKUTMpE2ypPqac3OODSGusQKAiQAAAAAAAAAATAATAAAATAJImATAAABMTAbW2nLjoYjUdKhoOnrmpHUk5U9OpznY1znt+i6lelVNBs7i8p1KpzY3S6bpYTTdKqaEdXCaDsaxoNmF14ksWgglfRjPkc7l9Tma9FCXYmEBQAImAlBKJAAASSBEyqEiJhJRImJAKyCYlSRESIiREhMwFZBEkolLEpETBCSpSkRapCRCYBIlIkSYFiswREwsAAEkWSJSiyyJm0zPpK+eTvec9XrHlI9r55vlom7EEgBAAAESACYAABJCYAAAAAJAgAAAAAAOtfm7TPTyefSdTW11vfrw8EnpeZqZTp6moXtU4OVOvn85K9bSwSbOXl7lbV+fjjpObB09CL16Di8vZNju+VvE+j4mqd/laasQbJhJgX0gz5HO5nT5mvRRJ2IlAUAQJACJQSiQBIkAlEqJSIkRKQAQSABIqJEAiRExZaphESBJYlKxaCEhZKRW1ViQiJKlKJWImSVraqxWYFZhQBImZSLLEWmzMWmZI9N5vYTo62n3Dz2zfcaxedldgARIAAAAAAESAAEwAAAADuLw3fHAd8cB3xwHfHBjvjgNrVQAAAAAFABESXbz9z0C+D0vpPijjIlkFATBAABCymEBQESAPSDPkc7mdPma9EHYAQTCREwSABEhEgBMSQETEkokiQAEiJgEkAlEkiVEiqYpMSItCRMSRaJSxJWtoErCUpStoWEipKpSi6yRE1KxNViJghJayCVkTMouukTaZmImhFJpdZPVc7eznX8tMa6AoAAEJAKCACSEiAAATAAAAAPo/zj6O1nDQAAAHjeH3OGxMCAAAIkIkoAIC+w73n/QNPE+28SccMAswITAAACokCCQESAejkz5HO5nT5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';
  var el=document.getElementById('about-banner-img');
  if(el){el.style.backgroundImage='url(data:image/jpeg;base64,'+b64+')';}
})();

/* ===== YOCO SALES DASHBOARD ===== */
var _ordersCache = null;
var _ordersLoading = false;

function ordersRender() {
  var container = document.getElementById('hub-orders-body');
  if (!container) return;

  if (_ordersLoading) return;
  _ordersLoading = true;
  container.innerHTML = '<p style="color:var(--fg3);font-size:13px;padding:16px 0;">Loading orders from Yoco...</p>';

  var pin = atob(ADM_CORRECT);
  fetch('/api/orders', {
    headers: { 'Authorization': 'Bearer ' + pin, 'Content-Type': 'application/json' }
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    _ordersLoading = false;
    if (data.error) {
      container.innerHTML = '<p style="color:#e55;font-size:13px;padding:16px 0;">Error: ' + data.error + '</p>';
      return;
    }
    _ordersCache = data;
    ordersRenderData(data);
  })
  .catch(function(err) {
    _ordersLoading = false;
    container.innerHTML = '<p style="color:#e55;font-size:13px;padding:16px 0;">Could not load orders. KV may not be configured yet.</p>';
  });
}

function ordersRenderData(data) {
  var container = document.getElementById('hub-orders-body');
  if (!container) return;
  var s = data.summary || {};
  var orders = data.orders || [];

  var statusFilter = (document.getElementById('ord-filter-status') || {}).value || 'all';
  var itemFilter = (document.getElementById('ord-filter-item') || {}).value || '';
  var filtered = orders.filter(function(o) {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false;
    if (itemFilter && o.item !== itemFilter) return false;
    return true;
  });

  var fmt = function(cents) { return 'R ' + (cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); };
  var fmtDate = function(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return d.toISOString().slice(0, 10) + ' ' + d.toTimeString().slice(0, 5);
  };
  var statusBadge = function(st) {
    var col = st === 'fulfilled' ? '#1E8540' : st === 'refunded' ? '#c0392b' : '#c07a00';
    return '<span style="display:inline-block;padding:2px 7px;border-radius:4px;background:' + col + '20;color:' + col + ';font-size:10.5px;font-weight:700;">' + st + '</span>';
  };

  // Summary cards
  var byItemHtml = Object.keys(s.byItem || {}).map(function(lbl) {
    var v = s.byItem[lbl];
    return '<span style="display:inline-block;margin:3px 4px 3px 0;background:var(--bg-alt);border:1px solid var(--border);border-radius:7px;padding:5px 10px;font-size:11.5px;">'
      + lbl + ': <strong>' + v.count + '</strong> &middot; ' + fmt(v.totalCents) + '</span>';
  }).join('');

  var csvRows = [['Date','Item','Amount','Email','Status','CheckoutID','DeliveryName','DeliveryCell','DeliveryAddress']];
  filtered.forEach(function(o) {
    csvRows.push([
      fmtDate(o.createdAt), o.itemLabel || o.item, (o.amountInCents / 100).toFixed(2),
      o.email || '', o.status || '', o.checkoutId || '',
      o.deliveryName || '', o.deliveryCell || '', o.deliveryAddress || ''
    ]);
  });
  var csvStr = csvRows.map(function(r) { return r.map(function(c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');

  // Build unique item list for filter
  var itemKeys = {};
  orders.forEach(function(o) { if (o.item) itemKeys[o.item] = o.itemLabel || o.item; });
  var itemOptions = Object.keys(itemKeys).map(function(k) { return '<option value="' + k + '">' + itemKeys[k] + '</option>'; }).join('');

  var html = '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">'
    + '<div style="flex:1;min-width:110px;background:var(--bg-alt);border-radius:9px;padding:12px;text-align:center;">'
    + '<div style="font-size:22px;font-weight:700;color:var(--amb);">' + s.total + '</div><div style="font-size:11px;color:var(--fg3);">Total orders</div></div>'
    + '<div style="flex:1;min-width:110px;background:var(--bg-alt);border-radius:9px;padding:12px;text-align:center;">'
    + '<div style="font-size:22px;font-weight:700;color:#1E8540;">' + s.fulfilled + '</div><div style="font-size:11px;color:var(--fg3);">Paid</div></div>'
    + '<div style="flex:1;min-width:110px;background:var(--bg-alt);border-radius:9px;padding:12px;text-align:center;">'
    + '<div style="font-size:22px;font-weight:700;color:var(--fg);">' + fmt(s.totalRevenueCents || 0) + '</div><div style="font-size:11px;color:var(--fg3);">Total revenue</div></div>'
    + '</div>'
    + '<div style="margin-bottom:8px;font-size:12px;color:var(--fg2);">By product (paid):</div>'
    + '<div style="margin-bottom:14px;">' + (byItemHtml || '<span style="font-size:12px;color:var(--fg3);">No fulfilled orders yet.</span>') + '</div>'
    // Filters
    + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center;">'
    + '<select id="ord-filter-status" onchange="ordersRenderData(_ordersCache)" style="padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--fg);font-size:12px;">'
    + '<option value="all">All statuses</option><option value="fulfilled">Paid</option><option value="pending">Pending</option><option value="refunded">Refunded</option>'
    + '</select>'
    + '<select id="ord-filter-item" onchange="ordersRenderData(_ordersCache)" style="padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--fg);font-size:12px;">'
    + '<option value="">All products</option>' + itemOptions
    + '</select>'
    + '<button onclick="ordersRender()" style="padding:5px 11px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--fg);font-size:12px;cursor:pointer;">Refresh</button>'
    + '<button onclick="ordersDownloadCsv()" style="padding:5px 11px;border-radius:6px;border:none;background:var(--amb);color:#fff;font-size:12px;cursor:pointer;">Export CSV</button>'
    + '</div>';

  if (!filtered.length) {
    html += '<p style="font-size:12.5px;color:var(--fg3);">No orders match the selected filters.</p>';
  } else {
    html += '<div style="overflow-x:auto;">'
      + '<table style="width:100%;border-collapse:collapse;font-size:12px;">'
      + '<thead><tr>'
      + ['Date','Product','Amount','Customer','Status','Delivery'].map(function(h) {
          return '<th style="text-align:left;padding:7px 8px;border-bottom:2px solid var(--border);color:var(--fg2);font-size:11px;white-space:nowrap;">' + h + '</th>';
        }).join('')
      + '</tr></thead><tbody>';

    filtered.forEach(function(o) {
      var delivery = '';
      if (o.deliveryName || o.deliveryAddress) {
        delivery = '<span style="font-size:10.5px;color:var(--fg3);">'
          + (o.deliveryName ? o.deliveryName + '<br>' : '')
          + (o.deliveryCell ? o.deliveryCell + '<br>' : '')
          + (o.deliveryAddress || '')
          + '</span>';
      }
      html += '<tr style="border-bottom:1px solid var(--border);">'
        + '<td style="padding:7px 8px;white-space:nowrap;color:var(--fg2);font-size:11px;">' + fmtDate(o.createdAt) + '</td>'
        + '<td style="padding:7px 8px;">' + (o.itemLabel || o.item || '') + '</td>'
        + '<td style="padding:7px 8px;white-space:nowrap;font-weight:600;">' + fmt(o.amountInCents || 0) + '</td>'
        + '<td style="padding:7px 8px;font-size:11px;">' + (o.email || '') + '</td>'
        + '<td style="padding:7px 8px;">' + statusBadge(o.status || 'unknown') + '</td>'
        + '<td style="padding:7px 8px;">' + (delivery || '<span style="color:var(--fg3);font-size:11px;">PDF/digital</span>') + '</td>'
        + '</tr>';
    });
    html += '</tbody></table></div>';
  }

  container.innerHTML = html;

  // Stash CSV for export
  container._csvStr = csvStr;
}

function ordersDownloadCsv() {
  var container = document.getElementById('hub-orders-body');
  if (!container || !container._csvStr) return;
  var blob = new Blob([container._csvStr], { type: 'text/csv' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'ribattseke-orders.csv'; a.click();
  setTimeout(function() { URL.revokeObjectURL(url); }, 2000);
}

/* ===== KYC & COMPLIANCE VAULT ===== */
function kycRender(){
  var el=document.getElementById('kyc-body');
  if(!el) return;
  var sections=[
    {
      title:'&#128100; Director KYC & Credentials',
      color:'#1E8540',
      items:[
        {key:'kyc_id_doc',label:'ID / Passport',icon:'&#128194;'},
        {key:'kyc_proof_addr',label:'Proof of Address',icon:'&#127968;'},
        {key:'kyc_cv',label:'CV / Curriculum Vitae',icon:'&#128203;'},
        {key:'kyc_qualifications',label:'Qualifications & Trade Certificates',icon:'&#127891;'},
        {key:'kyc_membership_certs',label:'Membership Certificates',icon:'&#127818;'}
      ]
    },
    {
      title:'&#127970; Corporate Documents',
      color:'#2563eb',
      items:[
        {key:'kyc_cipc',label:'CIPC Certificate',icon:'&#128196;'},
        {key:'kyc_sole_prop',label:'Sole Proprietor Agreements / Docs',icon:'&#128203;'},
        {key:'kyc_bbbee',label:'B-BBEE Affidavit / Certificate',icon:'&#10003;'},
        {key:'kyc_coida',label:'COIDA Letter of Good Standing',icon:'&#128396;'},
        {key:'kyc_pub_liability',label:'Public Liability Insurance',icon:'&#128737;'},
        {key:'kyc_prof_indem',label:'Professional Indemnity Insurance',icon:'&#128737;'}
      ]
    },
    {
      title:'&#128268; Technical Documents',
      color:'#f26522',
      items:[
        {key:'kyc_doel_wl',label:'DoEL Wireman\'s / Installation Electrician Licence',icon:'&#9889;'},
        {key:'kyc_contractor_reg',label:'Contractor Registration(s)',icon:'&#128196;'},
        {key:'kyc_ecsa_cert',label:'ECSA Registration Certificate (Pr Techni Eng)',icon:'&#127818;'}
      ]
    },
    {
      title:'&#9888; HSE Documents',
      color:'#dc2626',
      items:[
        {key:'kyc_s37_agr',label:'Section 37(2) Agreement(s)',icon:'&#128203;'},
        {key:'kyc_hse_file',label:'HSE File',icon:'&#128196;'},
        {key:'kyc_risk_assess',label:'Risk Assessments',icon:'&#128397;'},
        {key:'kyc_medical_fit',label:'Medical Fitness Cert (incl. Working at Heights)',icon:'&#128138;'},
        {key:'kyc_first_aid',label:'First Aid & Firefighting Records',icon:'&#127973;'},
        {key:'kyc_ppe_log',label:'PPE Stock / Issue Log',icon:'&#128115;'},
        {key:'kyc_tool_inspect',label:'Tool & Instrument Inspection Register',icon:'&#128296;'}
      ]
    },
    {
      title:'&#128179; Payment Gateway & Standards KYC',
      color:'#7c3aed',
      items:[
        {key:'kyc_yoco',label:'Yoco KYC Documents',icon:'&#128179;'},
        {key:'kyc_payflex',label:'Payflex KYC Documents',icon:'&#128179;'},
        {key:'kyc_sabs',label:'SABS Account / Standards KYC',icon:'&#128218;'}
      ]
    }
  ];

  var html='';
  sections.forEach(function(sec){
    html+='<div style="background:var(--bg-alt);border-radius:10px;padding:14px 16px;border-left:3px solid '+sec.color+';">'
      +'<div style="font-size:13px;font-weight:700;color:var(--fg);margin-bottom:10px;">'+sec.title+'</div>'
      +'<div style="display:grid;gap:7px;">';
    sec.items.forEach(function(item){
      var stored;
      try{ stored=JSON.parse(localStorage.getItem(BIZ_NS+item.key)||'null'); }catch(e){ stored=null; }
      var hasDoc=stored&&stored.name;
      var statusClr=hasDoc?'#1E8540':'#e55';
      var statusTxt=hasDoc?'&#10003; '+esc(stored.name):'&#8212; Not uploaded';
      html+='<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);">'
        +'<div style="font-size:12px;color:var(--fg2);">'+item.icon+' '+item.label+'</div>'
        +'<div style="display:flex;align-items:center;gap:6px;">'
        +'<span style="font-size:11px;color:'+statusClr+';">'+statusTxt+'</span>'
        +'<button onclick="kycAddDoc(\''+item.key+'\',\''+item.label.replace(/'/g,"\\'")+'\')" style="font-size:10.5px;padding:3px 8px;border-radius:12px;border:1px solid var(--border);background:var(--surface);color:var(--fg2);cursor:pointer;">'+( hasDoc?'Update':'+ Add')+'</button>'
        +(hasDoc?'<button onclick="kycDelDoc(\''+item.key+'\')" style="font-size:10.5px;padding:3px 7px;border-radius:12px;border:1px solid #e55;background:none;color:#e55;cursor:pointer;">&#10005;</button>':'')
        +'</div></div>';
    });
    html+='</div></div>';
  });
  el.innerHTML=html;
}

function kycAddDoc(key,label){
  var name='';
  var old;
  try{ old=JSON.parse(localStorage.getItem(BIZ_NS+key)||'null'); }catch(e){ old=null; }
  /* Inline form injection */
  var formId='kyc-form-'+key.replace(/[^a-z0-9]/gi,'_');
  var existing=document.getElementById(formId);
  if(existing){ existing.remove(); return; }
  var row=event&&event.target?event.target.closest('div[style*="border-bottom"]'):null;
  if(!row) { kycRender(); return; }
  var form=document.createElement('div');
  form.id=formId;
  form.style.cssText='margin-top:6px;padding:8px;background:var(--surface);border-radius:8px;border:1px solid var(--border);';
  form.innerHTML='<div style="font-size:11.5px;font-weight:600;color:var(--fg);margin-bottom:6px;">'+label+'</div>'
    +'<input id="'+formId+'-name" type="text" placeholder="Document name / reference" value="'+(old&&old.name?esc(old.name):'')+'" style="width:100%;box-sizing:border-box;padding:7px 10px;border-radius:6px;border:1px solid var(--border);background:#111;color:#fff;font-size:12px;margin-bottom:6px;">'
    +'<input id="'+formId+'-url" type="url" placeholder="Link (Drive, Dropbox, etc.) — optional" value="'+(old&&old.url?esc(old.url):'')+'" style="width:100%;box-sizing:border-box;padding:7px 10px;border-radius:6px;border:1px solid var(--border);background:#111;color:#fff;font-size:12px;margin-bottom:6px;">'
    +'<input id="'+formId+'-exp" type="date" title="Expiry date (optional)" value="'+(old&&old.exp?old.exp:'')+'" style="width:100%;box-sizing:border-box;padding:7px 10px;border-radius:6px;border:1px solid var(--border);background:#111;color:#fff;font-size:12px;margin-bottom:8px;">'
    +'<div style="display:flex;gap:6px;">'
    +'<button onclick="kycSaveDoc(\''+key+'\',\''+label.replace(/'/g,"\\'")+'\')" style="flex:1;padding:7px;border-radius:6px;border:none;background:#1E8540;color:#fff;cursor:pointer;font-size:12px;">Save</button>'
    +'<button onclick="document.getElementById(\''+formId+'\').remove()" style="padding:7px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--fg2);cursor:pointer;font-size:12px;">Cancel</button>'
    +'</div>';
  row.after(form);
  setTimeout(function(){ var inp=document.getElementById(formId+'-name'); if(inp)inp.focus(); },80);
}

function kycSaveDoc(key,label){
  var formId='kyc-form-'+key.replace(/[^a-z0-9]/gi,'_');
  var nameEl=document.getElementById(formId+'-name');
  var urlEl=document.getElementById(formId+'-url');
  var expEl=document.getElementById(formId+'-exp');
  if(!nameEl||!nameEl.value.trim()){ alert('Please enter a document name.'); return; }
  var rec={name:nameEl.value.trim(), url:(urlEl?urlEl.value.trim():''), exp:(expEl?expEl.value:''), updated:new Date().toISOString()};
  try{ localStorage.setItem(BIZ_NS+key,JSON.stringify(rec)); }catch(e){}
  /* If expiry set, auto-create expiry record */
  if(rec.exp){
    var expKey='exp_kyc_'+key;
    var existing2;
    try{ existing2=JSON.parse(localStorage.getItem(BIZ_NS+expKey)||'null'); }catch(e){ existing2=null; }
    if(!existing2){
      var newExp={id:expKey,doc:label,owner:'Riba T Tseke',issued:'',expiry:rec.exp,status:'active'};
      try{ localStorage.setItem(BIZ_NS+expKey,JSON.stringify(newExp)); }catch(e){}
    }
  }
  kycRender();
}

function kycDelDoc(key){
  if(!confirm('Remove this document record?')) return;
  try{ localStorage.removeItem(BIZ_NS+key); }catch(e){}
  kycRender();
}
/* ===== END KYC ===== */

/* ===== 30-DAY EXPIRY TRACKER ===== */
function expiryRender(){
  var el=document.getElementById('expiry-body');
  if(!el) return;
  var records=[];
  try{
    for(var i=0;i<localStorage.length;i++){
      var k=localStorage.key(i);
      if(k&&k.indexOf(BIZ_NS+'exp_')===0){
        try{ var r=JSON.parse(localStorage.getItem(k)); if(r&&r.expiry) records.push(r); }catch(e){}
      }
    }
  }catch(e){}

  var now=new Date(); now.setHours(0,0,0,0);
  records.sort(function(a,b){ return new Date(a.expiry)-new Date(b.expiry); });

  if(!records.length){
    el.innerHTML='<p style="font-size:12px;color:var(--fg3);text-align:center;padding:20px 0;">No expiry records yet. Click <strong>+ Add Record</strong> to track a document.</p>';
    return;
  }

  var expired=[],warning=[],ok=[];
  records.forEach(function(r){
    var exp=new Date(r.expiry); exp.setHours(0,0,0,0);
    var diff=Math.round((exp-now)/(1000*60*60*24));
    r._diff=diff;
    if(diff<0) expired.push(r);
    else if(diff<=30) warning.push(r);
    else ok.push(r);
  });

  function renderGroup(title,color,icon,list){
    if(!list.length) return '';
    var h='<div style="margin-bottom:14px;">'
      +'<div style="font-size:12px;font-weight:700;color:'+color+';margin-bottom:7px;">'+icon+' '+title+' ('+list.length+')</div>'
      +'<div style="display:grid;gap:7px;">';
    list.forEach(function(r){
      var daysStr=r._diff<0?'Expired '+(Math.abs(r._diff))+' day'+(Math.abs(r._diff)===1?'':'s')+' ago':r._diff===0?'Expires today':'Expires in '+r._diff+' day'+(r._diff===1?'':'s');
      h+='<div style="background:var(--bg-alt);border-radius:8px;padding:10px 12px;border-left:3px solid '+color+';display:flex;align-items:center;justify-content:space-between;gap:8px;">'
        +'<div>'
        +'<div style="font-size:12.5px;font-weight:600;color:var(--fg);">'+esc(r.doc||'Untitled')+'</div>'
        +'<div style="font-size:11px;color:var(--fg3);margin-top:2px;">Owner: '+esc(r.owner||'—')+' &middot; '+daysStr+'</div>'
        +(r.issued?'<div style="font-size:11px;color:var(--fg3);">Issued: '+esc(r.issued)+' &middot; Expires: '+esc(r.expiry)+'</div>':'<div style="font-size:11px;color:var(--fg3);">Expires: '+esc(r.expiry)+'</div>')
        +'</div>'
        +'<div style="display:flex;gap:5px;flex-shrink:0;">'
        +'<button onclick="expiryEdit(\''+esc(r.id)+'\')" style="font-size:10.5px;padding:3px 8px;border-radius:12px;border:1px solid var(--border);background:var(--surface);color:var(--fg2);cursor:pointer;">Edit</button>'
        +'<button onclick="expiryDel(\''+esc(r.id)+'\')" style="font-size:10.5px;padding:3px 7px;border-radius:12px;border:1px solid #e55;background:none;color:#e55;cursor:pointer;">&#10005;</button>'
        +'</div></div>';
    });
    h+='</div></div>';
    return h;
  }

  el.innerHTML=renderGroup('EXPIRED','#dc2626','&#128308;',expired)
    +renderGroup('Expiring within 30 days','#f59e0b','&#128993;',warning)
    +renderGroup('Valid','#1E8540','&#128994;',ok);
}

function expiryAdd(){
  var modal=document.getElementById('expiry-modal-bg');
  if(!modal){
    modal=document.createElement('div');
    modal.id='expiry-modal-bg';
    modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9800;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML='<div style="background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:22px 20px;width:340px;max-width:95vw;">'
      +'<div style="font-size:14px;font-weight:700;color:var(--fg);margin-bottom:14px;">Add Expiry Record</div>'
      +'<input id="exp-doc" type="text" placeholder="Document / certificate name *" style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:6px;border:1px solid #555;background:#111;color:#fff;font-size:12px;margin-bottom:7px;">'
      +'<input id="exp-owner" type="text" placeholder="Owner (default: Riba T Tseke)" value="Riba T Tseke" style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:6px;border:1px solid #555;background:#111;color:#fff;font-size:12px;margin-bottom:7px;">'
      +'<label style="font-size:11px;color:#aaa;display:block;margin-bottom:3px;">Issue date</label>'
      +'<input id="exp-issued" type="date" style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:6px;border:1px solid #555;background:#111;color:#fff;font-size:12px;margin-bottom:7px;">'
      +'<label style="font-size:11px;color:#aaa;display:block;margin-bottom:3px;">Expiry date *</label>'
      +'<input id="exp-expiry" type="date" style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:6px;border:1px solid #555;background:#111;color:#fff;font-size:12px;margin-bottom:7px;">'
      +'<select id="exp-status" style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:6px;border:1px solid #555;background:#111;color:#fff;font-size:12px;margin-bottom:12px;">'
      +'<option value="active">Active</option><option value="pending">Pending renewal</option><option value="expired">Expired</option></select>'
      +'<p id="exp-err" style="color:#e55;font-size:11.5px;margin:0 0 8px;display:none;"></p>'
      +'<div style="display:flex;gap:8px;">'
      +'<button onclick="expirySave(null)" style="flex:1;padding:9px;border-radius:7px;border:none;background:#1E8540;color:#fff;cursor:pointer;font-weight:600;font-size:13px;">Save</button>'
      +'<button onclick="document.getElementById(\'expiry-modal-bg\').remove()" style="padding:9px 14px;border-radius:7px;border:1px solid #555;background:#222;color:#aaa;cursor:pointer;">Cancel</button>'
      +'</div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click',function(e){ if(e.target===modal) modal.remove(); });
  } else { modal.style.display='flex'; }
  setTimeout(function(){ var inp=document.getElementById('exp-doc'); if(inp) inp.focus(); },80);
}

function expiryEdit(id){
  var rec;
  try{ rec=JSON.parse(localStorage.getItem(BIZ_NS+'exp_'+id)||'null'); }catch(e){ rec=null; }
  if(!rec) return;
  expiryAdd();
  setTimeout(function(){
    var setV=function(eid,val){ var el=document.getElementById(eid); if(el) el.value=val||''; };
    setV('exp-doc',rec.doc); setV('exp-owner',rec.owner); setV('exp-issued',rec.issued);
    setV('exp-expiry',rec.expiry);
    var sel=document.getElementById('exp-status'); if(sel) sel.value=rec.status||'active';
    var btn=document.querySelector('#expiry-modal-bg button[onclick*="expirySave"]');
    if(btn) btn.setAttribute('onclick','expirySave(\''+id+'\')');
  },120);
}

function expirySave(existingId){
  var doc=(document.getElementById('exp-doc')||{}).value||'';
  var owner=(document.getElementById('exp-owner')||{}).value||'';
  var issued=(document.getElementById('exp-issued')||{}).value||'';
  var expiry=(document.getElementById('exp-expiry')||{}).value||'';
  var status=(document.getElementById('exp-status')||{}).value||'active';
  var err=document.getElementById('exp-err');
  if(!doc.trim()){ if(err){err.textContent='Document name is required.';err.style.display='block';} return; }
  if(!expiry){ if(err){err.textContent='Expiry date is required.';err.style.display='block';} return; }
  var id=existingId||('exp_'+Date.now());
  var rec={id:id,doc:doc.trim(),owner:owner.trim()||'Riba T Tseke',issued:issued,expiry:expiry,status:status};
  try{ localStorage.setItem(BIZ_NS+'exp_'+id,JSON.stringify(rec)); }catch(e){}
  var modal=document.getElementById('expiry-modal-bg'); if(modal) modal.remove();
  expiryRender();
}

function expiryDel(id){
  if(!confirm('Delete this expiry record?')) return;
  try{ localStorage.removeItem(BIZ_NS+'exp_'+id); }catch(e){}
  expiryRender();
}
/* ===== END EXPIRY TRACKER ===== */

/* ===== FINANCIALS TRACKER ===== */
function finRender(){
  var el=document.getElementById('fin-body');
  if(!el) return;

  /* Aggregate from existing biz_ stores */
  var quotes=bizList('qt_');
  var invoices=bizList('inv_');
  var clients=bizList('cl_');

  function clientName(id){ var c=clients.find(function(x){return x.id===id;}); return c?c.name:'Unknown'; }

  /* Stats */
  var totalQuotes=quotes.length;
  var totalInvAmt=0, totalPaid=0, totalUnpaid=0, totalOverdue=0;
  var today=new Date(); today.setHours(0,0,0,0);
  invoices.forEach(function(inv){
    var amt=parseFloat(inv.total||inv.amount||0);
    totalInvAmt+=amt;
    if(inv.paid||inv.status==='paid') totalPaid+=amt;
    else {
      totalUnpaid+=amt;
      if(inv.due&&new Date(inv.due)<today) totalOverdue+=amt;
    }
  });

  function fmt(n){ return 'R\u00a0'+n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,','); }

  var html='';
  /* Summary cards */
  html+='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:16px;">';
  [
    {label:'Quotes Issued',val:totalQuotes,clr:'#2563eb',suffix:''},
    {label:'Total Invoiced',val:fmt(totalInvAmt),clr:'#1E8540',suffix:''},
    {label:'Collected',val:fmt(totalPaid),clr:'#059669',suffix:''},
    {label:'Outstanding',val:fmt(totalUnpaid),clr:'#f59e0b',suffix:''},
    {label:'Overdue',val:fmt(totalOverdue),clr:'#dc2626',suffix:''}
  ].forEach(function(c){
    html+='<div style="background:var(--bg-alt);border-radius:9px;padding:12px 14px;border-top:3px solid '+c.clr+';">'
      +'<div style="font-size:11px;color:var(--fg3);margin-bottom:4px;">'+c.label+'</div>'
      +'<div style="font-size:17px;font-weight:800;color:'+c.clr+';">'+c.val+'</div>'
      +'</div>';
  });
  html+='</div>';

  /* Invoices table */
  html+='<div style="background:var(--bg-alt);border-radius:10px;padding:14px 16px;">'
    +'<div style="font-size:13px;font-weight:700;color:var(--fg);margin-bottom:10px;">&#128203; Invoice Register</div>';
  if(!invoices.length){
    html+='<p style="font-size:12px;color:var(--fg3);">No invoices yet. Create them from the Quotes or Invoices hub.</p>';
  } else {
    html+='<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">'
      +'<thead><tr style="color:var(--fg3);border-bottom:1px solid var(--border);">'
      +'<th style="text-align:left;padding:5px 7px;">Ref</th><th style="text-align:left;padding:5px 7px;">Client</th>'
      +'<th style="text-align:right;padding:5px 7px;">Amount</th><th style="text-align:left;padding:5px 7px;">Status</th>'
      +'<th style="text-align:left;padding:5px 7px;">Due</th></tr></thead><tbody>';
    invoices.slice().sort(function(a,b){ return (b.date||'').localeCompare(a.date||''); }).forEach(function(inv){
      var amt=parseFloat(inv.total||inv.amount||0);
      var paid=inv.paid||inv.status==='paid';
      var due=inv.due;
      var overdue=!paid&&due&&new Date(due)<today;
      var statusClr=paid?'#1E8540':overdue?'#dc2626':'#f59e0b';
      var statusTxt=paid?'Paid':overdue?'Overdue':'Outstanding';
      html+='<tr style="border-bottom:1px solid var(--border);">'
        +'<td style="padding:5px 7px;font-weight:600;">'+esc(inv.ref||inv.number||inv.id||'—')+'</td>'
        +'<td style="padding:5px 7px;">'+esc(clientName(inv.clientId))+'</td>'
        +'<td style="padding:5px 7px;text-align:right;">'+fmt(amt)+'</td>'
        +'<td style="padding:5px 7px;"><span style="color:'+statusClr+';font-weight:600;">'+statusTxt+'</span></td>'
        +'<td style="padding:5px 7px;color:var(--fg3);">'+(due||'—')+'</td>'
        +'</tr>';
    });
    html+='</tbody></table></div>';
  }
  html+='</div>';

  /* Quotes summary */
  html+='<div style="background:var(--bg-alt);border-radius:10px;padding:14px 16px;">'
    +'<div style="font-size:13px;font-weight:700;color:var(--fg);margin-bottom:10px;">&#128196; Quotes Issued</div>';
  if(!quotes.length){
    html+='<p style="font-size:12px;color:var(--fg3);">No quotes yet. Use the Quotes hub to create them.</p>';
  } else {
    html+='<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">'
      +'<thead><tr style="color:var(--fg3);border-bottom:1px solid var(--border);">'
      +'<th style="text-align:left;padding:5px 7px;">Ref</th><th style="text-align:left;padding:5px 7px;">Client</th>'
      +'<th style="text-align:right;padding:5px 7px;">Amount</th><th style="text-align:left;padding:5px 7px;">Status</th>'
      +'<th style="text-align:left;padding:5px 7px;">Date</th></tr></thead><tbody>';
    quotes.slice().sort(function(a,b){ return (b.date||'').localeCompare(a.date||''); }).forEach(function(qt){
      var amt=parseFloat(qt.total||qt.amount||0);
      var status=qt.status||'draft';
      var statusClr=status==='accepted'?'#1E8540':status==='declined'?'#dc2626':'#f59e0b';
      html+='<tr style="border-bottom:1px solid var(--border);">'
        +'<td style="padding:5px 7px;font-weight:600;">'+esc(qt.ref||qt.number||qt.id||'—')+'</td>'
        +'<td style="padding:5px 7px;">'+esc(clientName(qt.clientId))+'</td>'
        +'<td style="padding:5px 7px;text-align:right;">'+fmt(amt)+'</td>'
        +'<td style="padding:5px 7px;"><span style="color:'+statusClr+';font-weight:600;text-transform:capitalize;">'+esc(status)+'</span></td>'
        +'<td style="padding:5px 7px;color:var(--fg3);">'+(qt.date||'—')+'</td>'
        +'</tr>';
    });
    html+='</tbody></table></div>';
  }
  html+='</div>';

  el.innerHTML=html;
}
/* ===== END FINANCIALS ===== */
