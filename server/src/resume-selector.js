export const RESUME_NAMES=['Frontend_Resume','Node_Resume','Node_Python_Resume','Python_Resume','Java_Resume','.NET_Resume','GO_Resume','AI_ML_Resume'];
const patterns={
 node:/\b(node(?:\.js|js)?|nestjs|express(?:\.js)?|fastify|koa|hono)\b/i,
 python:/\b(python|django|fastapi|flask|pydantic|sqlalchemy)\b/i,
 java:/\b(java|spring(?: boot)?|hibernate|quarkus|micronaut)\b/i,
 dotnet:/\b(c#|csharp|\.net|asp\.net|blazor|entity framework)\b/i,
 go:/\b(golang|go language|go developer|gin-gonic|gorm|go microservices)\b/i,
 ai:/\b(pytorch|tensorflow|scikit-learn|mlflow|hugging face|machine learning engineer|ml engineer)\b/i
};
export function recommendResume(text=''){
 const s=String(text); const found=Object.fromEntries(Object.entries(patterns).map(([k,v])=>[k,v.test(s)]));
 if(found.node&&found.python) return 'Node_Python_Resume';
 if(found.python) return 'Python_Resume';
 if(found.node) return 'Node_Resume';
 if(found.java) return 'Java_Resume';
 if(found.dotnet) return '.NET_Resume';
 if(found.go) return 'GO_Resume';
 if(found.ai) return 'AI_ML_Resume';
 return 'Frontend_Resume';
}
