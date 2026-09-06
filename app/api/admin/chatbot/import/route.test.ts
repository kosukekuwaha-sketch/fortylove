import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({session:vi.fn(),single:vi.fn(),rpc:vi.fn(),embed:vi.fn()}));
vi.mock("@/lib/auth",()=>({getSession:mocks.session}));
vi.mock("@/lib/db",()=>({db:()=>({from:()=>({select:()=>({eq:()=>({single:mocks.single})})}),rpc:mocks.rpc})}));
vi.mock("@/lib/embeddings",()=>({embedTexts:mocks.embed}));
import { POST } from "./route";
beforeEach(()=>{
  vi.clearAllMocks(); mocks.session.mockResolvedValue({id:"owner"}); mocks.single.mockResolvedValue({data:{role:"super_admin"}});
  mocks.rpc.mockResolvedValue({data:1,error:null}); mocks.embed.mockImplementation(async(texts:string[])=>texts.map(()=>Array(768).fill(.1)));
});
function request(files:File[],origin="http://localhost"){
  const body=new FormData(); files.forEach(file=>body.append("files",file));
  return new Request("http://localhost/api/admin/chatbot/import",{method:"POST",headers:{origin},body});
}
const file=(name="a.md",count=1)=>new File([Array.from({length:count},(_,i)=>`## 質問${i}\n回答です。`).join("\n")],name);
it("未認証・admin・別originでは取り込まない",async()=>{
  mocks.session.mockResolvedValue(null); expect((await POST(request([file()]))).status).toBe(401);
  mocks.session.mockResolvedValue({id:"admin"}); mocks.single.mockResolvedValue({data:{role:"admin"}}); expect((await POST(request([file()]))).status).toBe(403);
  expect((await POST(request([file()],"http://elsewhere"))).status).toBe(403); expect(mocks.rpc).not.toHaveBeenCalled();
});
it("ファイル数と合計容量をサーバーでも拒否する",async()=>{
  expect((await POST(request(Array.from({length:11},(_,i)=>file(`${i}.md`))))).status).toBe(400);
  expect((await POST(request([new File(["a".repeat(1000001)],"a.md")]))).status).toBe(400);
  expect(mocks.embed).not.toHaveBeenCalled();
});
it("1001件のファイルを中止しても他のファイルは取り込む",async()=>{
  const result=await (await POST(request([file("over.md",1001),file("valid.md")]))).text();
  expect(result).toContain("1000件の上限を超えています"); expect(result).toContain('"state":"完了"');
  expect(mocks.rpc).toHaveBeenCalledTimes(1); expect(mocks.rpc.mock.calls[0][1].p_name).toBe("valid.md");
});
it("Embeddingに失敗したら差し替えRPCを実行しない",async()=>{
  mocks.embed.mockRejectedValue(new Error("APIの利用枠を超えました"));
  const text=await (await POST(request([file()]))).text(); expect(text).toContain('"state":"エラー"'); expect(mocks.rpc).not.toHaveBeenCalled();
});
it("DB保存エラーを完了扱いにしない",async()=>{
  mocks.rpc.mockResolvedValue({error:{message:"test failure"}});
  const text=await (await POST(request([file()]))).text(); expect(text).toContain('"state":"エラー"'); expect(text).not.toContain('"state":"完了"');
});
