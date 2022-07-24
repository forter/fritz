distImages = [
    [repo: 'events-forwarder', regions: ['us-east-1', 'us-west-2']],
]

node('general') {
    base = load '/var/jenkins_home/workspace/Infra/build-scripts/build/Jenkinsfile'
    base.execute([
        distImages       : distImages,
        masterBranch     : 'main',
        alertSlackChannel: 'precision-engineering-oncall',
    ])
}
