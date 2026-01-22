export async function deleteFunction(functionId) {
  await fetch(`/api/query/v1/functions/template/${functionId}`, {
    method: 'DELETE'
  });
}
