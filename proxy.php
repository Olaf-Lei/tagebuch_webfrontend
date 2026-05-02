<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, PUT, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Webdav-Target, X-Webdav-User, X-Webdav-Pass');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
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
