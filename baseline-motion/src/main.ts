namespace Rally {
    export async function bootstrap(){
        const loading=document.getElementById('asset-loading')!;
        const status=document.getElementById('asset-status')!;
        const detail=document.getElementById('asset-detail')!;
        let game:Game;
        const fail=(error:unknown)=>{loading.hidden=false;loading.classList.add('failed');status.textContent='人物载入未完成';detail.textContent=error instanceof Error?error.message:String(error);console.error(error);};
        try{
            game=new Game(document.getElementById('court') as HTMLCanvasElement);new UI(game);
            (window as any).__rally=game;(window as any).__Rally=Rally;
            requestAnimationFrame(game.tick);
            const attach=(gltf:any)=>{
                // Validate and construct BOTH replacements before releasing the old models.
                let first:HumanRig|null=null,second:HumanRig|null=null;
                try{first=new HumanRig(gltf,game.world.r.threeScene);second=new HumanRig(gltf,game.world.r.threeScene);}
                catch(error){first?.dispose();second?.dispose();throw error;}
                game.player.visual?.dispose();game.ai.visual?.dispose();game.player.visual=first;game.ai.visual=second;
                game.player.pose(1/120,game.setup);game.ai.pose(1/120,DEFAULT_SETUP);game.assetsReady=true;
                loading.hidden=true;document.getElementById('asset-credit')!.textContent=`蒙皮人物 / ${Math.round(first.triangles).toLocaleString()} triangles / 手指与足部骨骼`;
            };
            (window as any).__attachHuman=attach;
            const load=async()=>{loading.hidden=false;loading.classList.remove('failed');status.textContent='准备球场';detail.textContent='连续蒙皮运动员与球场随游戏内置。';try{const gltf=await loadHumanAsset(s=>status.textContent=s);attach(gltf);}catch(error){fail(error);}};
            document.getElementById('asset-retry')!.onclick=()=>void load();
            (document.getElementById('model-file') as HTMLInputElement).onchange=async e=>{
                const file=(e.target as HTMLInputElement).files?.[0];if(!file)return;
                try{const loader=new BASELINE_ENGINE.GLTFLoader(),decoder=new BASELINE_ENGINE.DRACOLoader();decoder.setDecoderPath((window as any).BASELINE_DECODER_PATH||'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/libs/draco/');loader.setDRACOLoader(decoder);attach(await loader.parseAsync(await file.arrayBuffer(),''));decoder.dispose();}catch(error){fail(error);}
            };
            document.getElementById('inspect')!.onclick=()=>game.enterInspection();
            document.getElementById('motion-exit')!.onclick=()=>game.start(0);
            document.querySelectorAll<HTMLElement>('[data-motion]').forEach(button=>button.onclick=()=>{game.enterInspection(button.dataset.motion!);document.querySelectorAll('[data-motion]').forEach(e=>e.classList.remove('active'));button.classList.add('active');});
            document.querySelectorAll<HTMLElement>('[data-frame]').forEach(button=>button.onclick=()=>game.inspectFrame(button.dataset.frame!));
            (document.getElementById('motion-speed') as HTMLInputElement).oninput=e=>{game.inspectFrozen=false;game.inspectSpeed=Number((e.target as HTMLInputElement).value);};
            (document.getElementById('motion-angle') as HTMLInputElement).oninput=e=>game.inspectAngle=Number((e.target as HTMLInputElement).value);
            void load();
        }catch(error){fail(error);}
    }
    void bootstrap();
}
