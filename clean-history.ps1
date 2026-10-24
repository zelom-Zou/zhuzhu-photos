# 清理 Git 历史：把全部提交压缩成一个，再强制推送到 GitHub
# 由 clean-history.bat 调用

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

Write-Host '============================================'
Write-Host '  清理 Git 历史'
Write-Host '============================================'
Write-Host ''
Write-Host '作用：把所有历史提交压缩成一个，强制推送到 GitHub。'
Write-Host '      被删除过的旧照片将从历史中消失。'
Write-Host ''
Write-Host '注意：已经克隆过仓库的人手里的副本无法收回。'
Write-Host '      GitHub 服务器上的旧数据可能需要一段时间才彻底清除。'
Write-Host '      当前正在展示的照片不受影响。'
Write-Host ''

# 有未提交的修改就不动手
$dirty = git status --porcelain --untracked-files=no
if ($dirty) {
    Write-Host '[!] 有未提交的修改，请先处理后再运行。'
    exit 1
}

$count = git rev-list --count HEAD
Write-Host "当前提交数：$count"
Write-Host ''

$confirm = Read-Host '输入 YES 确认清理并强制推送'
if ($confirm -ne 'YES') {
    Write-Host '已取消，没有做任何改动。'
    exit 1
}

Write-Host ''
Write-Host '[1/4] 生成新提交…'
$tree = git write-tree
$new = git commit-tree $tree -m 'Squash history'
if (-not $new) {
    Write-Host '[!] 生成提交失败。'
    exit 1
}

Write-Host '[2/4] 移动 main 分支…'
git reset --soft $new
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host '[3/4] 强制推送到 GitHub…'
git push --force origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Host '[!] 推送失败，本地历史已改动但尚未推送。'
    Write-Host '    可以运行 git reflog 找回，或重试本脚本。'
    exit 1
}

Write-Host '[4/4] 清理本地旧数据…'
git reflog expire --expire=now --all
git gc --prune=now --quiet

Write-Host ''
Write-Host '完成。当前历史：'
git log --oneline
Write-Host ''
Write-Host '网页约 3 分钟后重建完成。'
exit 0
