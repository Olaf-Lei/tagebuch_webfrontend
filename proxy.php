<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, PUT, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Webdav-Target, X-Webdav-User, X-Webdav-Pass');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$action = $_GET['action'] ?? '';

if ($action === 'store_code') {
    header('Content-Type: application/json');
    $payload = json_decode(file_get_contents('php://input'), true);
    if (!$payload) { http_response_code(400); echo json_encode(['error' => 'Ungültiger Body']); exit; }
    $tmp = sys_get_temp_dir();
    foreach (glob($tmp . '/tgb_relay_*.json') ?: [] as $f) {
        if (filemtime($f) < time() - 300) @unlink($f);
    }
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $code = '';
    for ($i = 0; $i < 6; $i++) $code .= $chars[random_int(0, strlen($chars) - 1)];
    file_put_contents($tmp . '/tgb_relay_' . $code . '.json', json_encode(['ts' => time(), 'p' => $payload]));
    echo json_encode(['code' => $code]);
    exit;
}

if ($action === 'fetch_code') {
    header('Content-Type: application/json');
    $code = strtoupper(preg_replace('/[^A-Z0-9]/i', '', $_GET['code'] ?? ''));
    if (strlen($code) !== 6) { http_response_code(400); echo json_encode(['error' => 'Ungültiger Code']); exit; }

    // Brute-force protection: max 5 attempts per IP, then exponential backoff
    $ip = md5($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $rlFile = sys_get_temp_dir() . '/tgb_rl_' . $ip . '.json';
    $rl = file_exists($rlFile) ? (json_decode(file_get_contents($rlFile), true) ?? []) : [];
    $now = time();
    if (($rl['locked_until'] ?? 0) > $now) {
        $wait = $rl['locked_until'] - $now;
        http_response_code(429);
        echo json_encode(['error' => 'Zu viele Versuche.', 'retry_after' => $wait]);
        exit;
    }
    // Reset window if last attempt was >10 min ago
    if (($rl['last'] ?? 0) < $now - 600) $rl = [];

    $file = sys_get_temp_dir() . '/tgb_relay_' . $code . '.json';
    if (!file_exists($file)) {
        $rl['attempts'] = ($rl['attempts'] ?? 0) + 1;
        $rl['last'] = $now;
        if ($rl['attempts'] >= 5) {
            $rl['locked_until'] = $now + min(pow(2, $rl['attempts'] - 4), 3600);
        }
        file_put_contents($rlFile, json_encode($rl));
        http_response_code(404); echo json_encode(['error' => 'Code nicht gefunden oder abgelaufen.']); exit;
    }
    $content = json_decode(file_get_contents($file), true);
    @unlink($file);
    if (!$content || ($content['ts'] ?? 0) < $now - 300) {
        $rl['attempts'] = ($rl['attempts'] ?? 0) + 1;
        $rl['last'] = $now;
        file_put_contents($rlFile, json_encode($rl));
        http_response_code(404); echo json_encode(['error' => 'Code abgelaufen.']); exit;
    }
    // Success: reset rate limit
    @unlink($rlFile);
    echo json_encode($content['p']);
    exit;
}

if ($action === 'google_token' || $action === 'google_refresh') {
    header('Content-Type: application/json');
    require_once __DIR__ . '/proxy.config.php';
    $clientId     = $googleClientId;
    $clientSecret = $googleClientSecret;
    $input        = json_decode(file_get_contents('php://input'), true) ?? [];
    $params = $action === 'google_token'
        ? ['code'          => $input['code']          ?? '',
           'client_id'     => $clientId,
           'client_secret' => $clientSecret,
           'redirect_uri'  => $input['redirect_uri']  ?? '',
           'grant_type'    => 'authorization_code',
           'code_verifier' => $input['code_verifier'] ?? '']
        : ['refresh_token' => $input['refresh_token'] ?? '',
           'client_id'     => $clientId,
           'client_secret' => $clientSecret,
           'grant_type'    => 'refresh_token'];
    $ch = curl_init('https://oauth2.googleapis.com/token');
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($params));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    http_response_code($httpCode);
    echo $response;
    exit;
}

$target = $_SERVER['HTTP_X_WEBDAV_TARGET'] ?? '';
if (!$target || !preg_match('#^https://#', $target)) {
    http_response_code(400);
    echo 'Missing or invalid X-Webdav-Target (must be https://)';
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$user   = $_SERVER['HTTP_X_WEBDAV_USER'] ?? '';
$pass   = $_SERVER['HTTP_X_WEBDAV_PASS'] ?? '';

$ch = curl_init($target);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);

if ($user !== '') {
    curl_setopt($ch, CURLOPT_USERPWD, "$user:$pass");
    curl_setopt($ch, CURLOPT_HTTPAUTH, CURLAUTH_BASIC);
}

if ($method === 'PUT') {
    $data = file_get_contents('php://input');
    curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/octet-stream']);
}

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr  = curl_error($ch);
curl_close($ch);

if ($curlErr) {
    http_response_code(502);
    echo 'cURL error: ' . $curlErr;
    exit;
}

http_response_code($httpCode);
header('Content-Type: application/octet-stream');
echo $response;
