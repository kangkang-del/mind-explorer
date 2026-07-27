// Netlify Function: 处理登出
export const handler = async (event, context) => {
  return {
    statusCode: 302,
    headers: {
      'Set-Cookie': 'me_user=; Path=/; Max-Age=0',
      'Location': '/?logout=success'
    },
    body: ''
  };
};
